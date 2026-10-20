"""Restrict only the two named synthetic-test containers; retain stopped originals."""
import http.client
import json
import socket
import subprocess
import time

endpoint = subprocess.check_output(['docker', 'context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], text=True).strip()
assert endpoint.startswith('unix://'), 'A local Docker socket is required'


class Docker(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect(endpoint.removeprefix('unix://'))


for name in ['supabase_db_jarvis-home-test', 'supabase_kong_jarvis-home-test']:
    inspected = json.loads(subprocess.check_output(['docker', 'inspect', name]))[0]
    assert 'jarvis-home-test-loopback' in inspected['NetworkSettings']['Networks']
    host = inspected['HostConfig']
    bindings = [b for entries in host['PortBindings'].values() for b in entries]
    if all(b['HostIp'] == '127.0.0.1' for b in bindings):
        print(name + ': already restricted to localhost')
        continue
    body = inspected['Config']
    for binding in bindings:
        binding['HostIp'] = '127.0.0.1'
    body['HostConfig'] = host
    body['NetworkingConfig'] = {'EndpointsConfig': {'jarvis-home-test-loopback': {'Aliases': [name]}}}
    original = name + '-original-' + str(int(time.time()))
    subprocess.run(['docker', 'stop', name], check=True, stdout=subprocess.DEVNULL)
    subprocess.run(['docker', 'rename', name, original], check=True)
    conn = Docker('localhost')
    conn.request('POST', '/containers/create?name=' + name, json.dumps(body), {'Content-Type': 'application/json'})
    response = conn.getresponse()
    result = response.read()
    if response.status != 201:
        subprocess.run(['docker', 'rename', original, name], check=True)
        raise RuntimeError('Could not recreate test container; original restored but kept stopped')
    conn.close()
    subprocess.run(['docker', 'start', name], check=True, stdout=subprocess.DEVNULL)
    print(name + ': restricted to localhost; stopped original retained')

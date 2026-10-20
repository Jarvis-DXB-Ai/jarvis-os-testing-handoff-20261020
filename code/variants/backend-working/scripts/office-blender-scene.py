# Trusted procedural scene recipe; accepts only the broker's validated JSON.
import bpy, json, sys, math
from mathutils import Vector
from pathlib import Path
cfg = json.loads(Path(sys.argv[sys.argv.index('--') + 1]).read_text())
out = Path(cfg['out'])
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
primitive = cfg['primitive']
if primitive == 'sphere': bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, location=(0, 0, 1))
elif primitive == 'cylinder': bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=.8, depth=1.8, location=(0, 0, .9))
else: bpy.ops.mesh.primitive_cube_add(size=1.6, location=(0, 0, .8))
obj = bpy.context.object
obj.name = 'Office procedural draft'
color = tuple(int(cfg['color'][i:i+2], 16) / 255 for i in (1,3,5))
mat = bpy.data.materials.new('Office surface'); mat.diffuse_color = (*color, 1); mat.use_nodes = True
mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*color, 1)
obj.data.materials.append(mat)
bpy.ops.mesh.primitive_plane_add(size=200, location=(0,0,-.01))
floor = bpy.data.materials.new('Neutral floor'); floor.diffuse_color=(.04,.04,.05,1); bpy.context.object.data.materials.append(floor)
bpy.ops.object.light_add(type='AREA', location=(2,-3,6)); bpy.context.object.data.energy=450; bpy.context.object.data.shape='DISK'; bpy.context.object.data.size=4
bpy.ops.object.camera_add(location=(4,-5,3.5))
cam=bpy.context.object; cam.rotation_euler=(Vector((0,0,.7))-cam.location).to_track_quat('-Z','Y').to_euler(); cam.data.type='ORTHO'; cam.data.ortho_scale=3.7
scene=bpy.context.scene; scene.camera=cam; scene.render.engine='CYCLES'; scene.cycles.device='CPU'; scene.cycles.samples=4
scene.render.resolution_x=256; scene.render.resolution_y=256; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.render.filepath=str(out/'render.png'); scene.world.color=(.1,.1,.1)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'scene.blend'))
bpy.ops.render.render(write_still=True)
(out/'scene.json').write_text(json.dumps({'primitive':primitive,'width':256,'height':256,'clientGeometry':False,'editableFile':'scene.blend'},indent=2))

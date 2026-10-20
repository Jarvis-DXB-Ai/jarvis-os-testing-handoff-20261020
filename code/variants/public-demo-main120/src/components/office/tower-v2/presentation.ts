import manifest from './manifest.json';
import mapping from './seat-role-map.json';
import { allOfficeDepartments } from '@/lib/office-departments';
export const seats = manifest.agents.map(a => ({ ...a, appRole: mapping.seats.find(s => s.seat_id === a.id)?.app_role_id ?? null }));
export const roomCodes: Record<string, string> = { client: 'CP', support: 'CE', email: 'CE', content: 'CON', social: 'SOC', design: 'GD', knowledge: 'BRN', web: 'WEB', ads: 'ADS', finance: 'OPS', operations: 'OPS', coo: 'MAX' };
export const displayDepartment = (id: string) => id === 'email' ? 'support' : id === 'finance' ? 'operations' : id;
export const includesDepartment = (selected: string, id: string | undefined) => selected === 'all' || displayDepartment(selected) === displayDepartment(id ?? '');
export const roomIdForCode = (code: string) => ({ CP: 'client', CE: 'support', CON: 'content', SOC: 'social', GD: 'design', BRN: 'knowledge', WEB: 'web', ADS: 'ads', OPS: 'operations', MAX: 'coo', LOB: 'lobby' } as Record<string, string>)[code] ?? 'all';
export const seatForRole = (id: string | undefined) => seats.find(s => s.appRole === id);
export const roleDepartment = (id: string | undefined) => { const seat = seatForRole(id); return seat ? roomIdForCode(seat.department) : displayDepartment(allOfficeDepartments.find(d => d.roles.includes(id ?? ''))?.id ?? 'operations'); };
export const displayRole = (id: string, fallback: string) => id === 'coo' ? 'Max · COO' : seatForRole(id)?.role ?? fallback;
export const unseatedRoles = new Set([...mapping.retired_old_roles_heads_do_qa, ...Object.keys(mapping.merged_old_roles)]);
/** Display groups only. Source department/task IDs and authorship are never rewritten. */
export function departmentGroups() { return manifest.rooms.filter(r => r.code !== 'LOB').map(r => { const id = roomIdForCode(r.code), sources = allOfficeDepartments.filter(d => displayDepartment(d.id) === id), physical = seats.filter(s => s.department === r.code), roles = [...new Set([...physical.flatMap(s => s.appRole ? [s.appRole] : []), ...sources.flatMap(d => d.roles).filter(role => !seatForRole(role))])]; return { id, name: r.title, code: r.code, roles, headRoleIds: sources.flatMap(d => [d.headRoleId, d.qaRoleId]), runtimeIds: sources.map(d => d.id) }; }).concat([{ id: 'coo', name: 'Max · COO', code: 'MAX', roles: ['coo'], headRoleIds: ['coo'], runtimeIds: [] }]); }
export const departmentName = (id: string) => id === 'all' ? 'Whole office' : departmentGroups().find(d => d.id === displayDepartment(id))?.name ?? id;
export const compactSeatLabel = (role: string) => role.replace('Head of ', '').replace('Specialist', '').replace('Manager', '').replace('Creative Director', 'Creative lead').replace('Strategist', 'strategy').replace(' & ', ' / ').replace('Customer Engagement', 'Engagement').replace('Content Creative', 'Content').replace('Google / YouTube Ads', 'Google / YouTube').replace(' [paused]', ' · paused').trim();
export function taskDepartment(job: {
    department: string;
    stages?: {
        role: string;
        kind?: string;
    }[];
}) { const author = job.stages?.find(s => s.kind === 'work') ?? job.stages?.find(s => !['qa', 'head', 'coo'].includes(s.kind ?? '')); return author ? roleDepartment(author.role) : displayDepartment(job.department); }
export function taskIncludes(selected: string, job: {
    department: string;
    stages?: {
        role: string;
        kind?: string;
    }[];
}) { return selected === 'all' || displayDepartment(selected) === taskDepartment(job); }

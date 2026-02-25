import { ENV, WhitelistEntry, CustomPattern, Detection, AuditLog } from '../types';

const USER_ID = 'single-user'; // Single user ID for self-hosted instance

// Whitelist operations
export async function getWhitelist(env: ENV): Promise<WhitelistEntry[]> {
	const data = await env.WHITELIST_STORE.get(USER_ID);
	if (!data) return [];
	return JSON.parse(data);
}

export async function addToWhitelist(env: ENV, domain: string): Promise<WhitelistEntry> {
	const whitelist = await getWhitelist(env);
	const entry: WhitelistEntry = {
		id: crypto.randomUUID(),
		domain,
		created_at: new Date().toISOString(),
	};
	whitelist.push(entry);
	await env.WHITELIST_STORE.put(USER_ID, JSON.stringify(whitelist));
	return entry;
}

export async function removeFromWhitelist(env: ENV, whitelistId: string): Promise<boolean> {
	const whitelist = await getWhitelist(env);
	const filtered = whitelist.filter((entry) => entry.id !== whitelistId);
	if (filtered.length === whitelist.length) return false;
	await env.WHITELIST_STORE.put(USER_ID, JSON.stringify(filtered));
	return true;
}

export async function isWhitelisted(env: ENV, domain: string): Promise<boolean> {
	const whitelist = await getWhitelist(env);
	return whitelist.some((entry) => entry.domain === domain);
}

// Patterns operations
export async function getPatterns(env: ENV): Promise<CustomPattern[]> {
	const data = await env.PATTERNS_STORE.get(USER_ID);
	if (!data) return [];
	return JSON.parse(data);
}

export async function addPattern(env: ENV, pattern: Omit<CustomPattern, 'id' | 'created_at'>): Promise<CustomPattern> {
	const patterns = await getPatterns(env);
	const newPattern: CustomPattern = {
		...pattern,
		id: crypto.randomUUID(),
		created_at: new Date().toISOString(),
	};
	patterns.push(newPattern);
	await env.PATTERNS_STORE.put(USER_ID, JSON.stringify(patterns));
	return newPattern;
}

export async function updatePattern(
	env: ENV,
	patternId: string,
	updates: Partial<Omit<CustomPattern, 'id' | 'created_at'>>,
): Promise<CustomPattern | null> {
	const patterns = await getPatterns(env);
	const index = patterns.findIndex((p) => p.id === patternId);
	if (index === -1) return null;
	patterns[index] = { ...patterns[index], ...updates };
	await env.PATTERNS_STORE.put(USER_ID, JSON.stringify(patterns));
	return patterns[index];
}

export async function deletePattern(env: ENV, patternId: string): Promise<boolean> {
	const patterns = await getPatterns(env);
	const filtered = patterns.filter((p) => p.id !== patternId);
	if (filtered.length === patterns.length) return false;
	await env.PATTERNS_STORE.put(USER_ID, JSON.stringify(filtered));
	return true;
}

// Detections operations
export async function addDetection(env: ENV, detection: Omit<Detection, 'id' | 'timestamp'>): Promise<Detection> {
	const detections = await getDetections(env);
	const newDetection: Detection = {
		...detection,
		id: crypto.randomUUID(),
		timestamp: new Date().toISOString(),
	};
	detections.push(newDetection);
	// Keep only last 10000 detections to prevent storage bloat
	if (detections.length > 10000) {
		detections.splice(0, detections.length - 10000);
	}
	await env.DETECTIONS_STORE.put(USER_ID, JSON.stringify(detections));
	return newDetection;
}

export async function addDetectionsBatch(env: ENV, detections: Omit<Detection, 'id' | 'timestamp'>[]): Promise<void> {
	const existing = await getDetections(env);
	const newDetections: Detection[] = detections.map((d) => ({
		...d,
		id: crypto.randomUUID(),
		timestamp: new Date().toISOString(),
	}));
	existing.push(...newDetections);
	// Keep only last 10000 detections
	if (existing.length > 10000) {
		existing.splice(0, existing.length - 10000);
	}
	await env.DETECTIONS_STORE.put(USER_ID, JSON.stringify(existing));
}

export async function getDetections(env: ENV): Promise<Detection[]> {
	const data = await env.DETECTIONS_STORE.get(USER_ID);
	if (!data) return [];
	return JSON.parse(data);
}

export async function getDetectionsByDateRange(
	env: ENV,
	startDate: string,
	endDate: string,
): Promise<Detection[]> {
	const detections = await getDetections(env);
	return detections.filter(
		(d) => d.timestamp >= startDate && d.timestamp <= endDate,
	);
}

// Audit logs operations
export async function addAuditLog(env: ENV, log: Omit<AuditLog, 'id' | 'created_at'>): Promise<void> {
	const logs = await getAuditLogs(env);
	const newLog: AuditLog = {
		...log,
		id: crypto.randomUUID(),
		created_at: new Date().toISOString(),
	};
	logs.push(newLog);
	// Keep only last 5000 logs
	if (logs.length > 5000) {
		logs.splice(0, logs.length - 5000);
	}
	await env.LOGS_STORE.put(USER_ID, JSON.stringify(logs));
}

export async function getAuditLogs(env: ENV): Promise<AuditLog[]> {
	const data = await env.LOGS_STORE.get(USER_ID);
	if (!data) return [];
	return JSON.parse(data);
}

export async function getAuditLogsByDateRange(
	env: ENV,
	startDate: string,
	endDate: string,
	eventType?: string,
	limit: number = 100,
): Promise<AuditLog[]> {
	const logs = await getAuditLogs(env);
	let filtered = logs.filter((log) => log.created_at >= startDate && log.created_at <= endDate);
	if (eventType) {
		filtered = filtered.filter((log) => log.event_type === eventType);
	}
	return filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, limit);
}


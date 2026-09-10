import crypto from 'crypto';

const configuredToken = String(process.env.HQ_API_TOKEN || process.env.BYTEPLUS_API_TOKEN || '').trim();
export const byteplusAuthToken = configuredToken || crypto.randomBytes(32).toString('hex');
export const byteplusAuthCookie = 'hq_byteplus_token';

if (!configuredToken) {
    console.warn(`[BytePlus] HQ_API_TOKEN/BYTEPLUS_API_TOKEN chưa được cấu hình; token tạm thời: ${byteplusAuthToken}`);
}

function parseCookies(header = '') {
    return Object.fromEntries(header.split(';').map(part => {
        const i = part.indexOf('=');
        return i < 0 ? [] : [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim())];
    }).filter(pair => pair.length));
}

export function tokenFromRequest(req) {
    const auth = String(req.headers.authorization || '');
    if (/^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
    return parseCookies(req.headers.cookie || '')[byteplusAuthCookie] || '';
}

export function tokenMatches(candidate) {
    const a = Buffer.from(String(candidate || ''));
    const b = Buffer.from(byteplusAuthToken);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function requireByteplusAuth(req, res, next) {
    if (tokenMatches(tokenFromRequest(req))) return next();
    res.status(401).json({ error: 'Unauthorized', code: 'HQ_API_TOKEN_REQUIRED' });
}

export function setByteplusAuthCookie(res) {
    res.setHeader('Set-Cookie', `${byteplusAuthCookie}=${encodeURIComponent(byteplusAuthToken)}; Path=/; HttpOnly; SameSite=Lax`);
}

export function socketToken(socket) {
    const authToken = socket.handshake.auth && socket.handshake.auth.token;
    const header = socket.handshake.headers && socket.handshake.headers.authorization;
    const queryToken = socket.handshake.query && socket.handshake.query.token;
    if (authToken) return authToken;
    if (header && /^Bearer\s+/i.test(header)) return header.replace(/^Bearer\s+/i, '').trim();
    if (queryToken) return queryToken;
    return parseCookies(socket.handshake.headers?.cookie || '')[byteplusAuthCookie] || '';
}

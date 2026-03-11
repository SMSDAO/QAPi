// resolve.ts

// Middleware for CORS
export function cors(req, res, next) {
    const origin = req.headers.origin;
    if (['https://qapi.github.io', 'http://localhost:3000'].includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('ETag', 'your-etag-value'); // handle ETag passthrough
    }
    next();
}

// Tier parsing functions
export function parseTier(moduleId) {
    if (moduleId.startsWith('gh:')) {
        return 'GitHub module'; // add logic to handle GitHub module ids
    } else if (moduleId.startsWith('blob:')) {
        return 'Blob module'; // add logic to handle blob module ids
    }
    return null; // handle unknown formats
}

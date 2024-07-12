export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		// Check if the path includes 'dl'
		if (url.pathname.includes('dl')) {
			try {
				// Construct the cache key from the cache URL
				const cacheKey = new Request(url.toString(), request);
				const cache = caches.default;

				// Check whether the value is already available in the cache
				let response = await cache.match(cacheKey);

				if (response) {
					console.log(`Cache hit for: ${request.url}.`);
					return response;
				}

				console.log(`Response for request url: ${request.url} not present in cache. Fetching and caching request.`);

				// If not in cache, get it from ASSETS
				const object = await env.ASSETS.get('wolf-4s.mp3', {
					range: request.headers,
					onlyIf: request.headers,
				})

				if (object === null) {
					return new Response('Object Not Found', { status: 404 });
				}

				const headers = new Headers()
				object.writeHttpMetadata(headers)
				headers.set('etag', object.httpEtag)
				if (object.range) {
					headers.set("content-range", `bytes ${object.range.offset}-${object.range.end ?? object.size - 1}/${object.size}`)
				}
				// Cache for 60 seconds
				headers.append('Cache-Control', 's-maxage=60');

				const status = object.body ? (request.headers.get("range") !== null ? 206 : 200) : 304
				response = new Response(object.body, {
					headers,
					status
				})

				// Store the fetched response as cacheKey
				ctx.waitUntil(cache.put(cacheKey, response.clone()));

				return response;
			} catch (e) {
				return new Response('Error thrown ' + e.message);
			}
		}

		// Create an object to store all headers
		const headers = {};

		// Iterate through all headers in the request
		for (const [key, value] of request.headers.entries()) {
			headers[key] = value;
		}

		// Add some information about the request
		headers['cf-connecting-ip'] = request.headers.get('cf-connecting-ip');
		headers['cf-ipcountry'] = request.cf.country;
		headers['cf-ray'] = request.headers.get('cf-ray');

		// Create a JSON response
		const jsonResponse = JSON.stringify(headers, null, 2);

		// Return the JSON response with appropriate headers
		return new Response(jsonResponse, {
			headers: {
				'Content-Type': 'application/json',
			},
		});
	},
};
import { Router, error, json, withParams } from 'itty-router'
import ProjectStore from './store';  // Import the ProjectStore class we created earlier
import { Client } from './claudette';
const coder = `You are an expert web developer, you are tasked with producing a single html files.  All of your code should be inline in the html file, but you can use CDNs to import packages if needed.`

const withStore = async (request, env) => {
	env.store = new ProjectStore(env.DB, env.R2);

	// FIXME(ja): for security should we require domain to be the one we are deploying for?
	let url = new URL(request.url);
	let host = url.host;
	let hostparts = host.split('.');
	if (hostparts.length > 2) {
		host = hostparts.slice(-2).join('.');
	}
	env.linkify = (project) => {
		project.project_link = `${url.protocol}//${project.name}.${host}`
		project.version_link = `${url.protocol}//${project.name}_${project.live_version_id}.${host}`
	}
}

const debugError = (error, env) => {
	console.log(error)
	return json({ error: "Internal Server Error", message: error.message }, 500)
}

// FIXME(ja): the only origin for API should eventually only allow admin.domain ?
const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
};

const router = Router({
	before: [withParams, withStore],
	catch: debugError,
	finally: [(response) => {
		if (response instanceof Response) {
			Object.entries(corsHeaders).forEach(([key, value]) => {
				response.headers.set(key, value);
			});
		}
		return response;
	}, json],
})

router.options('*', () => new Response(null, { status: 204, headers: corsHeaders }))

router
	.get('/v0/projects', async (request, env) => {
		const projects = await env.store.listProjects();
		projects.forEach(p => {
			env.linkify(p)
		})
		return json(projects);
	})
	.post('/v0/projects', async (request, env) => {
		const params = await request.json();
		// Ensure pages have metadata field if provided
		if (params.pages) {
			params.pages = params.pages.map(page => ({
				...page,
				metadata: page.metadata || {},
			}));
		}
		const p = await env.store.createProject(params)
		env.linkify(p)
		return json(p)
	})
	.get('/v0/projects/:project_name', async (request, env) => {
		const { project_name } = request.params;
		try {
			const p = await env.store.getProject(project_name);
			env.linkify(p)
			return json(p)
		} catch (e) {
			console.log(e)
			return error(404, 'Project not found');
		}
	})
	.patch('/v0/projects/:project_name', async (request, env) => {
		const { project_name } = request.params;
		const changed_pages = await request.json();
		// Ensure changed pages have metadata field if provided
		const updatedPages = changed_pages.map(page => ({
			...page,
			metadata: page.metadata !== undefined ? page.metadata : {},
		}));
		const p = await env.store.updateProject(project_name, updatedPages);
		env.linkify(p)
		return json(p)
	})
	.post("/v0/projects/:project_name/pages/:page_name/generate", async (request, env) => {
		const { project_name, page_name } = request.params;
		const { prompt } = await request.json();
		const chat = new Client(env.ANTHROPIC_API_KEY);

		const project = await env.store.getProject(project_name);
		const currentPage = project.pages.find(p => p.name === page_name);

		let messages = []
		if (currentPage) {
			messages.push(currentPage.metadata.spec || '')
			messages.push(await env.store.getContent(currentPage.hash))
		}
		messages.push(prompt)

		const response = await chat.call(messages, { prefill: "<html>", sp: coder });
		console.log({ response });
		let content = response.content[0].text;

		const p = await env.store.updateProject(project_name, [{
			name: page_name,
			content: content,
			metadata: { spec: prompt }
		}]);
		return json(p);
	})
	.get("/v0/raw/:hash", async (request, env) => {
		const { hash } = request.params;
		const html = await env.store.getContent(hash);
		return new Response(html, { headers: { 'Content-Type': 'text/html' } });
	})
	.get("/favicon.ico", async (request, env) => {
		return new Response(null, { status: 204 });
	})
	.get('/:pageName?', async (request, env) => {
		let { pageName } = request.params;
		if (!pageName) {
			pageName = 'index';
		}
		const url = new URL(request.url);
		const subdomain = url.hostname.split('.')[0];

		let project;
		if (subdomain.includes('_')) {
			const [projectName, versionName] = subdomain.split('_');
			project = await env.store.getProject(projectName, versionName);
		} else {
			project = await env.store.getProject(subdomain);
		}
		if (!project) {
			return error(404, 'Project not found');
		}
		const page = project.pages.find(p => p.name === pageName);
		if (!page) {
			return error(404, 'Page not found');
		}

		try {
			const html = await env.store.getContent(page.hash);
			return new Response(html, { headers: { 'Content-Type': 'text/html' } });
		} catch (e) {
			return error(500, 'Content missing');
		}
	})
	.get('/v0/projects/:project_name/versions', async (request, env) => {
		const { project_name } = request.params;
		try {
			const versions = await env.store.listProjectVersions(project_name);
			return json(versions);
		} catch (e) {
			console.log(e);
			return error(404, 'Project not found');
		}
	})
	.get('/v0/projects/:project_name/versions/:version_id', async (request, env) => {
		const { project_name, version_id } = request.params;
		try {
			const p = await env.store.getProject(project_name, version_id);
			env.linkify(p.project);
			return json(p);
		} catch (e) {
			console.log(e);
			return error(404, 'Project version not found');
		}
	})

export default router
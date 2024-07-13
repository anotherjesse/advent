import { Router, error, json, withParams } from 'itty-router'
import ProjectStore from './store';  // Import the ProjectStore class we created earlier


const withStore = async (request, env) => {
	env.store = new ProjectStore(env.DB, env.R2);

	// FIXME(ja): for security should we require domain to be the one we are deploying for?
	let url = new URL(request.url);
	let host = url.host;
	let hostparts = host.split('.');
	if (hostparts.length > 2) {
		host = hostparts.slice(-2).join('.');
	}
	env.linkify = (project, include_version) => {
		project.link = `${url.protocol}://${project.name}${include_version ? `_${project.live_version_id}` : ''}.${host}`
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
	.get("/v0/debug", async (request, env) => {
		return json({ request: request.url, base: env.base })
	})
	.get('/v0/projects', async (request, env) => {
		const projects = await env.store.listProjects();
		projects.forEach(p => {
			env.linkify(p, true)
		})
		return json(projects);
	})
	.post('/v0/projects', async (request, env) => {
		const params = await request.json();
		const p = await env.store.createProject(params)
		env.linkify(p, true)
		return json(p)
	})
	.get('/v0/projects/:project_name', async (request, env) => {
		const { project_name } = request.params;
		const p = await env.store.getProject(project_name);
		env.linkify(p, true)
		return json(p)
	})
	.patch('/v0/projects/:project_name', async (request, env) => {
		const { project_name } = request.params;
		const changed_pages = await request.json();
		const p = await env.store.updateProject(project_name, changed_pages);
		env.linkify(p, true)
		return json(p)
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


// 	.post('/projects/:projectName/pages/:pageName/generate', async (request, env) => {
// 		const projectStore = new ProjectStore(env.DB, env.R2);
// 		const { projectName, pageName } = request.params;
// 		const body = await parseJSONBody(request);
// 		if (!body || !body.prompt) {
// 			return error(400, 'Invalid request body');
// 		}

// 		const messages = [];
// 		try {
// 			const page = await projectStore.getPageContent(projectName, pageName);
// 			if (page) {
// 				messages.push("What is the current page content?");
// 				messages.push(page);
// 			}
// 		} catch (e) {
// 			// Page doesn't exist, which is fine
// 		}

// 		messages.push(body.prompt);
// 		const content = await generateContent(messages);
// 		const updatedProject = await projectStore.createOrUpdatePage(projectName, pageName, content);
// 		return json(updatedProject, 201);
// 	})




export default router
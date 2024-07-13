import { Router, error, json, withParams } from 'itty-router'
import ProjectStore from './store';  // Import the ProjectStore class we created earlier


const withStore = async (request, env) => {
	env.store = new ProjectStore(env.DB, env.R2);
}


// Helper function to generate content (placeholder)
async function generateContent(messages) {
	// This is a placeholder. In a real implementation, you would call your AI service here.
	return "Generated content based on: " + messages.join(" ");
}

const myError = (error, env) => {
	console.log(error)
	return json({ error: "Internal Server Error", message: error.message }, 500)
}

const router = Router({
	before: [withParams, withStore],
	catch: myError,
	finally: [json],
})

router

	.get('/v0/projects', async (request, env) => {
		const projects = await env.store.listProjects();
		return json(projects);
	})
	.post('/v0/projects', async (request, env) => {
		const params = await request.json();
		const p = await env.store.createProject(params)
		return json(p)
	})
	.get("/v0/raw/:hash", async (request, env) => {
		const { hash } = request.params;
		const html = await env.store.getContent(hash);
		return new Response(html, { headers: { 'Content-Type': 'text/html' } });
	})
	.get("/", async (request, env) => {
		return json({ message: "Hello World!" });
	})
	.get('/:pageName?', async (request, env) => {
		const { pageName = 'index' } = request.params;
		const url = new URL(request.url);
		const subdomain = url.hostname.split('.')[0];
		const project = await env.store.getProject(subdomain);
		const page = project.pages.find(p => p.name === pageName);
		const html = await env.store.getContent(page.hash);
		return new Response(html, { headers: { 'Content-Type': 'text/html' } });
	})

// 	.post('/projects', async (request, env) => {
// 		const projectStore = new ProjectStore(env.DB, env.R2);
// 		const body = await parseJSONBody(request);
// 		if (!body || !body.name || !Array.isArray(body.pages)) {
// 			return error(400, 'Invalid request body');
// 		}
// 		try {
// 			const project = await projectStore.createProject(body.name, body.pages);
// 			return json(project, 201);
// 		} catch (e) {
// 			return error(409, e.message);
// 		}
// 	})

// 	.get('/projects/:projectName', async (request, env) => {
// 		const projectStore = new ProjectStore(env.DB, env.R2);
// 		const { projectName } = request.params;
// 		try {
// 			const project = await projectStore.getProject(projectName);
// 			return json(project);
// 		} catch (e) {
// 			return error(404, 'Project not found');
// 		}
// 	})

// 	.get('/projects/:projectName/versions', async (request, env) => {
// 		const projectStore = new ProjectStore(env.DB, env.R2);
// 		const { projectName } = request.params;
// 		const versions = await projectStore.listProjectVersions(projectName);
// 		return json(versions);
// 	})

// 	.post('/projects/:projectName/pages', async (request, env) => {
// 		const projectStore = new ProjectStore(env.DB, env.R2);
// 		const { projectName } = request.params;
// 		const body = await parseJSONBody(request);
// 		if (!body || !body.name || !body.content) {
// 			return error(400, 'Invalid request body');
// 		}
// 		const updatedProject = await projectStore.createOrUpdatePage(projectName, body.name, body.content, body.title);
// 		return json(updatedProject, 201);
// 	})

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

// 	.delete('/projects/:projectName/pages/:pageName', async (request, env) => {
// 		const projectStore = new ProjectStore(env.DB, env.R2);
// 		const { projectName, pageName } = request.params;
// 		const updatedProject = await projectStore.deletePage(projectName, pageName);
// 		return json(updatedProject);
// 	});

// // Content Routes
// contentRouter
// 	.get('/:pageName?', async (request, env) => {
// 		const projectStore = new ProjectStore(env.DB, env.R2);
// 		const { pageName = 'index' } = request.params;
// 		const url = new URL(request.url);
// 		const subdomain = url.hostname.split('.')[0];

// 		let projectName, versionName;
// 		if (subdomain.includes('_')) {
// 			[projectName, versionName] = subdomain.split('_');
// 		} else {
// 			projectName = subdomain;
// 			versionName = null;
// 		}

// 		try {
// 			const project = await projectStore.getProject(projectName, versionName);
// 			const page = project.pages.find(p => p.name === pageName);
// 			if (page) {
// 				const content = await projectStore.getPageContent(projectName, pageName);
// 				return new Response(content, {
// 					headers: { 'Content-Type': 'text/html' },
// 				});
// 			}
// 		} catch (e) {
// 			// Project or page not found
// 		}

// 		return error(404, 'Page not found');
// 	});

// // Main router
// const router = Router();

// router
// .all('/api/v0/*', apiRouter.handle)
// .all('*', contentRouter.handle);

// // Export the fetch handler
// export default {

// 	async fetch(request, env) {
// 		if (env.router === undefined) {
// 			env.router = buildRouter(env)
// 		}

// 		return env.router.handle(request)
// 	}
// }



export default router
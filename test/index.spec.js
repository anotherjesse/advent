import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { SELF } from "cloudflare:test";

import { describe, it, expect, afterEach } from 'vitest';
import worker from '../src';

describe('worker', () => {

	it('creating empty project', async () => {
		let response = await SELF.fetch("http://api.localtest.me/v0/projects")
		expect(await response.json()).toEqual([]);

		let project = { name: "empty" }

		response = await SELF.fetch("http://api.localtest.me/v0/projects", { method: "POST", body: JSON.stringify(project) })
		expect(response.status).toBe(200);
		response = await SELF.fetch("http://api.localtest.me/v0/projects")
		const projects = await response.json();
		expect(projects).toBeInstanceOf(Array);
		expect(projects.length).toBe(1);
		expect(projects[0]).toEqual(expect.objectContaining(project));
		console.log(projects[0].link)
		expect(projects[0].version_link).toEqual(expect.stringMatching(/^http:\/\/empty_[a-z0-9-]+\.localtest\.me$/));
		expect(projects[0].project_link).toEqual(expect.stringMatching(/^http:\/\/empty\.localtest\.me$/));
	});

	it('creating seeded project', async () => {
		let seed = {
			name: "seeded",
			pages: [
				{ name: "one", content: "this is the first page" },
				{ name: "two", content: "this is the second page" },
			]
		}
		let response = await SELF.fetch("http://api.localtest.me/v0/projects", { method: "POST", body: JSON.stringify(seed) })
		expect(response.status).toBe(200);
		let { project, pages, version } = await response.json();
		expect(project).toEqual(expect.objectContaining({ name: seed.name }));
		for (let { name, content } of seed.pages) {
			let server_page = pages.find(p => p.name === name);
			expect(server_page).toEqual(expect.objectContaining({ name }));
			expect(server_page).not.toHaveProperty('content');
			expect(server_page).toHaveProperty('hash');

			// now we can fetch it?
			let page = await SELF.fetch(`http://api.localtest.me/v0/raw/${server_page.hash}`)
			expect(page.status).toBe(200);
			expect(await page.text()).toEqual(content);
		}
		// expect(version).toEqual(expect.objectContaining({ pages }));
		response = await SELF.fetch("http://api.localtest.me/v0/projects")
		const projects = await response.json();
		expect(projects).toBeInstanceOf(Array);
		expect(projects.length).toBe(1);
		expect(projects[0]).toEqual(expect.objectContaining({ name: seed.name }));
	});


	it('creating serves content', async () => {
		let seed = {
			name: "seeded",
			pages: [
				{ name: "one", content: "this is the first page" },
				{ name: "two", content: "this is the second page" },
			]
		}
		let response = await SELF.fetch("http://api.localtest.me/v0/projects", { method: "POST", body: JSON.stringify(seed) })
		expect(response.status).toBe(200);

		for (let { name, content } of seed.pages) {
			response = await SELF.fetch(`http://${seed.name}.localtest.me/${name}`)
			expect(await response.text()).toEqual(content);
		}
	});

	it('updating project page', async () => {
		let seed = {
			name: "update-test",
			pages: [
				{ name: "page", content: "original content" },
				{ name: "other", content: "other content" },
				{ name: "deleteme", content: "deletion test" },
			]
		}
		let response = await SELF.fetch("http://api.localtest.me/v0/projects", { method: "POST", body: JSON.stringify(seed) })
		expect(response.status).toBe(200);

		let updateData = [
			{ name: "page", content: "updated content" },
			{ name: "deleteme", content: null },
		]
		response = await SELF.fetch("http://api.localtest.me/v0/projects/update-test", { method: "PATCH", body: JSON.stringify(updateData) })
		expect(response.status).toBe(200);

		response = await SELF.fetch(`http://update-test.localtest.me/page`)
		expect(await response.text()).toEqual("updated content");
	});

	it('deleting project page', async () => {
		let seed = {
			name: "deleting",
			pages: [
				{ name: "page", content: "original content" },
				{ name: "deleteme", content: "deletion test" },
			]
		}
		let response = await SELF.fetch("http://api.localtest.me/v0/projects", { method: "POST", body: JSON.stringify(seed) })
		expect(response.status).toBe(200);

		response = await SELF.fetch(`http://deleting.localtest.me/deleteme`)
		expect(response.status).toBe(200);

		let updateData = [
			{ name: "deleteme", content: null },
		]
		response = await SELF.fetch("http://api.localtest.me/v0/projects/deleting", { method: "PATCH", body: JSON.stringify(updateData) })
		expect(response.status).toBe(200);

		response = await SELF.fetch(`http://deleting.localtest.me/deleteme`)
		expect(response.status).toBe(404);
	});

	it('adding project page', async () => {
		let seed = {
			name: "additions",
			pages: [
				{ name: "existing", content: "existing content" },
			]
		}
		let response = await SELF.fetch("http://api.localtest.me/v0/projects", { method: "POST", body: JSON.stringify(seed) })
		expect(response.status).toBe(200);
		const original_data = await response.json();
		const original_version_id = original_data.project.live_version_id;

		response = await SELF.fetch(`http://additions.localtest.me/future`)
		expect(response.status).toBe(404);

		let updateData = [
			{ name: "future", content: "future content" },
		]
		response = await SELF.fetch("http://api.localtest.me/v0/projects/additions", { method: "PATCH", body: JSON.stringify(updateData) })
		expect(response.status).toBe(200);
		let new_data = await response.json();
		expect(new_data.project.live_version_id).not.toEqual(original_version_id);

		response = await SELF.fetch(`http://additions.localtest.me/future`)
		expect(response.status).toBe(200);
		expect(await response.text()).toEqual("future content");

		response = await SELF.fetch(`http://additions.localtest.me/existing`)
		expect(response.status).toBe(200);
		expect(await response.text()).toEqual("existing content");
	});


	it('index page served at root', async () => {
		let seed = {
			name: "index-test",
			pages: [
				{ name: "index", content: "index content" },
				{ name: "other", content: "other content" },
			]
		}
		let response = await SELF.fetch("http://api.localtest.me/v0/projects", { method: "POST", body: JSON.stringify(seed) })
		expect(response.status).toBe(200);

		response = await SELF.fetch(`http://index-test.localtest.me/`)
		expect(response.status).toBe(200);
		expect(await response.text()).toEqual("index content");

		response = await SELF.fetch(`http://index-test.localtest.me/index`)
		expect(response.status).toBe(200);
		expect(await response.text()).toEqual("index content");
	});

	it('404 for non-existent pages', async () => {
		let seed = {
			name: "404-test",
			pages: [
				{ name: "existing", content: "this page exists" },
			]
		}
		let response = await SELF.fetch("http://api.localtest.me/v0/projects", { method: "POST", body: JSON.stringify(seed) })
		expect(response.status).toBe(200);

		response = await SELF.fetch(`http://404-test.localtest.me/non-existent`)
		expect(response.status).toBe(404);
	});

	it('creating seeded project with page metadata', async () => {
		let seed = {
			name: "metadata-test",
			pages: [
				{ 
					name: "page-with-meta", 
					content: "This page has metadata",
					metadata: {
						spec: "v1.0",
						customKey: "customValue"
					}
				},
				{ 
					name: "page-without-meta", 
					content: "This page has no metadata" 
				},
			]
		}
		let response = await SELF.fetch("http://api.localtest.me/v0/projects", { method: "POST", body: JSON.stringify(seed) })
		expect(response.status).toBe(200);
		let { project, pages, version } = await response.json();
		expect(project).toEqual(expect.objectContaining({ name: seed.name }));
		
		for (let { name, content, metadata } of seed.pages) {
			let server_page = pages.find(p => p.name === name);
			expect(server_page).toEqual(expect.objectContaining({ name }));
			expect(server_page).not.toHaveProperty('content');
			expect(server_page).toHaveProperty('hash');
			
			if (metadata) {
				expect(server_page.metadata).toEqual(metadata);
			} else {
				expect(server_page.metadata).toEqual({});
			}

			// Fetch and check content
			let page = await SELF.fetch(`http://api.localtest.me/v0/raw/${server_page.hash}`)
			expect(page.status).toBe(200);
			expect(await page.text()).toEqual(content);
		}
	});

	it('updating page metadata', async () => {
		let seed = {
			name: "update-metadata",
			pages: [
				{ 
					name: "meta-page", 
					content: "Original content",
					metadata: { spec: "v1.0" }
				},
			]
		}
		let response = await SELF.fetch("http://api.localtest.me/v0/projects", { method: "POST", body: JSON.stringify(seed) })
		expect(response.status).toBe(200);

		let updateData = [
			{ 
				name: "meta-page", 
				content: "Updated content",
				metadata: { spec: "v2.0", newKey: "newValue" }
			},
		]
		response = await SELF.fetch("http://api.localtest.me/v0/projects/update-metadata", { method: "PATCH", body: JSON.stringify(updateData) })
		expect(response.status).toBe(200);
		
		let updatedProject = await response.json();
		let updatedPage = updatedProject.pages.find(p => p.name === "meta-page");
		expect(updatedPage.metadata).toEqual({ spec: "v2.0", newKey: "newValue" });

		response = await SELF.fetch(`http://update-metadata.localtest.me/meta-page`)
		expect(await response.text()).toEqual("Updated content");
	});

	it('listing project versions', async () => {
		let seed = {
			name: "version-test",
			pages: [
				{ name: "page", content: "initial content" },
			]
		}
		let response = await SELF.fetch("http://api.localtest.me/v0/projects", { method: "POST", body: JSON.stringify(seed) })
		expect(response.status).toBe(200);

		// Update the project to create a new version
		let updateData = [
			{ name: "page", content: "updated content" },
		]
		response = await SELF.fetch("http://api.localtest.me/v0/projects/version-test", { method: "PATCH", body: JSON.stringify(updateData) })
		expect(response.status).toBe(200);

		 // List versions
		response = await SELF.fetch("http://api.localtest.me/v0/projects/version-test/versions")
		expect(response.status).toBe(200);
		let versions = await response.json();
		expect(versions).toBeInstanceOf(Array);
		expect(versions.length).toBe(2);
		expect(versions[0]).toHaveProperty('id');
		expect(versions[0]).toHaveProperty('created_at');
		expect(versions[1]).toHaveProperty('id');
		expect(versions[1]).toHaveProperty('created_at');
	});

	it('getting specific project version', async () => {
		let seed = {
			name: "specific-version-test",
			pages: [
				{ name: "page", content: "initial content" },
			]
		}
		let response = await SELF.fetch("http://api.localtest.me/v0/projects", { method: "POST", body: JSON.stringify(seed) })
		expect(response.status).toBe(200);
		let initialProject = await response.json();

		// Update the project to create a new version
		let updateData = [
			{ name: "page", content: "updated content" },
		]
		response = await SELF.fetch("http://api.localtest.me/v0/projects/specific-version-test", { method: "PATCH", body: JSON.stringify(updateData) })
		expect(response.status).toBe(200);
		let updatedProject = await response.json();

		// Get the initial version
		response = await SELF.fetch(`http://api.localtest.me/v0/projects/specific-version-test/versions/${initialProject.version.id}`)
		expect(response.status).toBe(200);
		let initialVersion = await response.json();
		expect(initialVersion.version.id).toBe(initialProject.version.id);
		expect(initialVersion.pages[0].hash).toBe(initialProject.pages[0].hash);

		// Get the updated version
		response = await SELF.fetch(`http://api.localtest.me/v0/projects/specific-version-test/versions/${updatedProject.version.id}`)
		expect(response.status).toBe(200);
		let updatedVersion = await response.json();
		expect(updatedVersion.version.id).toBe(updatedProject.version.id);
		expect(updatedVersion.pages[0].hash).toBe(updatedProject.pages[0].hash);
	});

});
import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { SELF } from "cloudflare:test";

import { describe, it, expect, afterEach } from 'vitest';
import worker from '../src';

describe('worker', () => {

	it('creating empty project', async () => {
		let response = await SELF.fetch("http://api.example.com/v0/projects")
		expect(await response.json()).toEqual([]);

		let project = { name: "empty" }

		response = await SELF.fetch("http://api.example.com/v0/projects", { method: "POST", body: JSON.stringify(project) })
		expect(response.status).toBe(200);
		response = await SELF.fetch("http://api.example.com/v0/projects")
		const projects = await response.json();
		expect(projects).toBeInstanceOf(Array);
		expect(projects.length).toBe(1);
		expect(projects[0]).toEqual(expect.objectContaining(project));
	});


	it('creating seeded project', async () => {
		let seed = {
			name: "seeded",
			pages: [
				{ name: "one", content: "this is the first page" },
				{ name: "two", content: "this is the second page" },
			]
		}
		let response = await SELF.fetch("http://api.example.com/v0/projects", { method: "POST", body: JSON.stringify(seed) })
		expect(response.status).toBe(200);
		let { project, pages, version } = await response.json();
		expect(project).toEqual(expect.objectContaining({ name: seed.name }));
		for (let {name, content} of seed.pages) {
			let server_page = pages.find(p => p.name === name);
			expect(server_page).toEqual(expect.objectContaining({ name }));
		    expect(server_page).not.toHaveProperty('content');
			expect(server_page).toHaveProperty('hash');

			// now we can fetch it?
			let page = await SELF.fetch(`http://api.example.com/v0/raw/${server_page.hash}`)
			expect(page.status).toBe(200);
			expect(await page.text()).toEqual(content);
		}
		// expect(version).toEqual(expect.objectContaining({ pages }));
		response = await SELF.fetch("http://api.example.com/v0/projects")
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
		let response = await SELF.fetch("http://api.example.com/v0/projects", { method: "POST", body: JSON.stringify(seed) })
		expect(response.status).toBe(200);

		for (let {name, content} of seed.pages) {
			response = await SELF.fetch(`http://${seed.name}.example.com/${name}`)
			expect(await response.text()).toEqual(content);
		}
	});

	it("shows hello world on index", async () => {
		const response = await SELF.fetch("https://example.com");
		expect(await response.json()).toEqual({ message: "Hello World!" });
	});

});
const fs = require('fs');
const path = require('path');

class CodetteClient {
    constructor(baseUrl) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
    }

    async listProjects() {
        const response = await fetch(`${this.baseUrl}/v0/projects`);
        return response.json();
    }

    async createProject(project) {
        const response = await fetch(`${this.baseUrl}/v0/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(project)
        });
        return response.json();
    }

    async getProject(projectName) {
        const response = await fetch(`${this.baseUrl}/v0/projects/${projectName}`);
        if (response.status === 404) {
            return null;
        }
        return response.json();
    }

    async listProjectVersions(projectName) {
        const response = await fetch(`${this.baseUrl}/v0/projects/${projectName}/versions`);
        return response.json();
    }

    async updateProject(projectName, changedPages) {
        const response = await fetch(`${this.baseUrl}/v0/projects/${projectName}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(changedPages)
        });
        return response.json();
    }

    async getContent(hash) {
        const response = await fetch(`${this.baseUrl}/v0/raw/${hash}`);
        return response.text();
    }
}

async function importDirectory(importPath) {
    const url = process.env.CODETTE_API_URL || 'http://api.localtest.me:8787';
    const client = new CodetteClient(url);

    const projectName = path.basename(importPath);
    const pageName = (filePath) => path.basename(filePath, path.extname(filePath));

    const files = fs.readdirSync(importPath);
    const pages = files.filter(file => file.endsWith('.html')).map(file => {
        const filePath = path.join(importPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const name = pageName(file);
        
        // Read spec from corresponding .md file if it exists
        let metadata = {};
        const specFile = path.join(importPath, `${name}.md`);
        if (fs.existsSync(specFile)) {
            metadata.spec = fs.readFileSync(specFile, 'utf-8');
        }

        return {
            name,
            content,
            metadata
        };
    });

    if (await client.getProject(projectName)) {
        await client.updateProject(projectName, pages);
    }
    else {
        const newProject = { name: projectName, pages };
        await client.createProject(newProject);
    }
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.log('Usage: node bootstrap.js <path1> <path2> ...');
        process.exit(1);
    }

    for (const path of args) {
        await importDirectory(path);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { CodetteClient, importDirectory };
const hashContent = async (content) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const validateName = (name) => {
  if (!/^[a-z0-9-]+$/.test(name)) {
    throw new Error("Name must be lowercase alphanumeric with dashes only, no spaces");
  }
  return name;
}


class ProjectStore {
  constructor(db, r2Bucket) {
    this.db = db;
    this.r2Bucket = r2Bucket;
  }

  async createProject({name, pages}) {
    validateName(name);

    const existingProject = await this.db.prepare(
      "SELECT name FROM projects WHERE name = ?"
    ).bind(name).first();

    if (existingProject) {
      throw new Error(`A project named '${name}' already exists`);
    }

    const newVersionId = crypto.randomUUID();
    await this.db.prepare(
      "INSERT INTO projects (name, live_version_id) VALUES (?, ?)"
    ).bind(name, newVersionId).run();

    const pagesMeta = (pages || []).map(p => ({
      hash: crypto.randomUUID(),
      id: crypto.randomUUID(),
      name: p.name,
    }));

    await this.db.prepare(
      "INSERT INTO versions (id, project_name, parent_version_id, pages) VALUES (?, ?, NULL, ?)"
    ).bind(newVersionId, name, JSON.stringify(pagesMeta)).run();

    for (const page of (pages || [])) {
      const hash = pagesMeta.find(p => p.name === page.name).hash;
      const id = pagesMeta.find(p => p.name === page.name).id;
      await this.r2Bucket.put(hash, page.content);
      await this.db.prepare(
        "INSERT INTO pages (id, name, hash) VALUES (?, ?, ?)"
      ).bind(id, page.name, hash).run();
    }

    return this.getProject(name, newVersionId );
  }

  async getProject(name, versionId = null) {
    let project = await this.db.prepare(
      "SELECT * FROM projects WHERE name = ?"
    ).bind(name).first();

    if (!project) {
      throw new Error("Project not found");
    }

    if (versionId === null) {
      versionId = project.live_version_id;
    }

    let version;
    if (versionId) {
      version = await this.db.prepare(
        "SELECT * FROM versions WHERE id = ?"
      ).bind(versionId).first();
    }

    if (!version) {
      throw new Error("Version not found");
    }

    const pages = version ? JSON.parse(version.pages) : [];

    return { project, version, pages };
  }



  async listProjects() {
    const projects = await this.db.prepare(
      "SELECT * FROM projects ORDER BY name"
    ).all();

    return projects.results;
  }

  async createOrUpdatePage(projectName, pageName, content, title = null) {
    await this.validateName(pageName);
    const contentHash = await this.hashContent(content);
    await this.r2Bucket.put(contentHash, content);

    const project = await this.getProject(projectName);
    const pages = project.pages;
    const pageIndex = pages.findIndex(p => p.name === pageName);

    if (pageIndex === -1) {
      pages.push({
        id: crypto.randomUUID(),
        name: pageName,
        title: title || pageName,
        content_hash: contentHash
      });
    } else {
      pages[pageIndex] = {
        ...pages[pageIndex],
        title: title || pages[pageIndex].title,
        content_hash: contentHash
      };
    }

    const newVersionId = crypto.randomUUID();
    await this.db.prepare(
      "INSERT INTO versions (id, project_name, parent_version_id, pages) VALUES (?, ?, ?, ?)"
    ).bind(newVersionId, projectName, project.version, JSON.stringify(pages)).run();

    await this.db.prepare(
      "UPDATE projects SET live_version_id = ? WHERE name = ?"
    ).bind(newVersionId, projectName).run();

    return this.getProject(projectName);
  }

  async getContent(hash) {
    const content = await this.r2Bucket.get(hash);
    if (!content) {
      throw new Error("Content not found");
    }
    return content.text();
  }

  async deletePage(projectName, pageName) {
    const project = await this.getProject(projectName);
    const pages = project.pages.filter(p => p.name !== pageName);

    const newVersionId = crypto.randomUUID();
    await this.db.prepare(
      "INSERT INTO versions (id, project_name, parent_version_id, pages) VALUES (?, ?, ?, ?)"
    ).bind(newVersionId, projectName, project.version, JSON.stringify(pages)).run();

    await this.db.prepare(
      "UPDATE projects SET live_version_id = ? WHERE name = ?"
    ).bind(newVersionId, projectName).run();

    return this.getProject(projectName);
  }

  async getPageContent(projectName, pageName) {
    const project = await this.getProject(projectName);
    const page = project.pages.find(p => p.name === pageName);

    if (!page) {
      throw new Error("Page not found");
    }

    const content = await this.r2Bucket.get(page.content_hash);
    if (!content) {
      throw new Error("Content not found");
    }

    return content.text();
  }

  async projectExists(name) {
    const project = await this.db.prepare(
      "SELECT name FROM projects WHERE name = ?"
    ).bind(name).first();
    return !!project;
  }

  async listProjectVersions(projectName) {
    const versions = await this.db.prepare(
      "SELECT id FROM versions WHERE project_name = ? ORDER BY id DESC"
    ).bind(projectName).all();
    return versions.results.map(v => v.id);
  }
}

export default ProjectStore;
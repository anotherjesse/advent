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

// version ids will be in the hostname
const createVersionId = () => {
  let rand = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  let ts = Date.now() % 100000;
  return `${ts}-${rand}`;
}



class ProjectStore {
  constructor(db, r2Bucket) {
    this.db = db;
    this.r2Bucket = r2Bucket;
  }

  async createProject({ name, pages }) {
    validateName(name);

    const existingProject = await this.db.prepare(
      "SELECT name FROM projects WHERE name = ?"
    ).bind(name).first();

    if (existingProject) {
      throw new Error(`A project named '${name}' already exists`);
    }

    const newVersionId = createVersionId();
    await this.db.prepare(
      "INSERT INTO projects (name, live_version_id) VALUES (?, ?)"
    ).bind(name, newVersionId).run();

    const pagesMeta = [];
    for (const p of (pages || [])) {
      pagesMeta.push({
        id: crypto.randomUUID(),
        hash: await hashContent(p.content),
        name: p.name,
        metadata: p.metadata || {},  // Add metadata field
      });
    }

    for (const page of (pages || [])) {
      const hash = pagesMeta.find(p => p.name === page.name).hash;
      await this.r2Bucket.put(hash, page.content);
    }

    await this.db.prepare(
      "INSERT INTO versions (id, project_name, parent_id, pages) VALUES (?, ?, NULL, ?)"
    ).bind(newVersionId, name, JSON.stringify(pagesMeta)).run();

    return this.getProject(name, newVersionId);
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

    let version = await this.db.prepare(
      "SELECT * FROM versions WHERE id = ? AND project_name = ?"
    ).bind(versionId, name).first();

    if (!version) {
      throw new Error("Version not found");
    }

    const pages = JSON.parse(version.pages);

    version.parent_id = version.parent_id || null;

    return { project, version, pages };
  }

  async listProjects() {
    const projects = await this.db.prepare(
      "SELECT * FROM projects"
    ).all();

    return projects.results.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getContent(hash) {
    const content = await this.r2Bucket.get(hash);
    if (!content) {
      throw new Error("Content not found");
    }
    return content.text();
  }

  async updateProject(projectName, changed_pages, versionId = null) {
    const { project, version, pages } = await this.getProject(projectName, versionId);

    let newPages = [...pages];

    for (const { name, content, metadata } of changed_pages) {
      const existingPageIndex = newPages.findIndex(p => p.name === name);

      if (!content) {
        if (existingPageIndex !== -1) {
          newPages.splice(existingPageIndex, 1); // delete
        }
      } else {
        const hash = await hashContent(content);
        if (existingPageIndex !== -1) {
          newPages[existingPageIndex] = {
            ...newPages[existingPageIndex],
            hash,
            metadata: metadata || newPages[existingPageIndex].metadata,
          };
        } else {
          newPages.push({
            id: crypto.randomUUID(),
            name,
            hash,
            metadata: metadata || {},
          });
        }
        await this.r2Bucket.put(hash, content);
      }
    }

    const newVersionId = createVersionId();

    await this.db.prepare(
      "INSERT INTO versions (id, project_name, parent_id, pages) VALUES (?, ?, ?, ?)"
    ).bind(newVersionId, project.name, version.id, JSON.stringify(newPages)).run();

    // new version always becomes the live version
    await this.db.prepare(
      "UPDATE projects SET live_version_id = ? WHERE name = ?"
    ).bind(newVersionId, project.name).run();

    return this.getProject(projectName, newVersionId);
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
      "SELECT id, created_at, parent_id FROM versions WHERE project_name = ?"
    ).bind(projectName).all();

    if (!versions.results.length) {
      throw new Error("Project not found");
    }

    return versions.results.map(v => ({
      id: v.id,
      created_at: v.created_at,
      parent_id: v.parent_id
    })).sort((a, b) => b.created_at - a.created_at);
  }
}

export default ProjectStore;
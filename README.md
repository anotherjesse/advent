API issues

- [ ] store metadata for projects
- [x] store prompt or spec for a page
  - I added metadata to pages objects, which is a json key/value pairs.  The spec is a key/value pair with the key "spec"
- [ ] patch should always work in the context of a version
- [ ] versions should have a "what changed" summary?
- [ ] generations / saving should be from a specific version
- [ ] listing versions should include the parent version

DATA issues

- [ ] re-add files
- [ ] users / orgs / ownership should exist

Open questions:

- can a version have more than 1 parent?  I think so
- should I expose this as git as well?

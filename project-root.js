const fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os');
function createProjectRootGuard({ home = os.homedir(), env = process.env } = {}) {
  let protectedFolders;
  const key = (value) => (process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value));
  async function protectedRoots() {
    if (!protectedFolders)
      protectedFolders = (async () => {
        // The shared Public profile (C:\Users\Public) has the same broad folders as a user profile.
        const homes = [
          os.homedir(),
          home,
          env.OneDrive,
          env.OneDriveConsumer,
          env.OneDriveCommercial,
          env.PUBLIC,
        ].filter(Boolean);
        const candidates = [
          ...homes,
          ...homes.flatMap((folder) =>
            ['Documents', 'Desktop', 'Downloads', 'Pictures', 'Music', 'Videos', 'AppData'].map((name) =>
              path.join(folder, name),
            ),
          ),
          path.dirname(home),
          os.tmpdir(),
          env.APPDATA,
          env.LOCALAPPDATA,
          env.SystemRoot,
          env.ProgramFiles,
          env['ProgramFiles(x86)'],
          env.ProgramData,
        ].filter(Boolean);
        return new Set(
          await Promise.all(candidates.map(async (folder) => key(await fs.realpath(folder).catch(() => folder)))),
        );
      })();
    return protectedFolders;
  }
  // Every profile folder directly under the users folder (C:\Users\<anyone>), not only this one.
  let usersFolder;
  const profilesParent = () =>
    (usersFolder ||= fs.realpath(path.dirname(home)).then(key, () => key(path.dirname(home))));
  async function isProtected(folder) {
    const actual = await fs.realpath(folder);
    return (
      key(actual) === key(path.parse(actual).root) ||
      (await protectedRoots()).has(key(actual)) ||
      key(path.dirname(actual)) === (await profilesParent())
    );
  }
  async function assertProject(folder) {
    const actual = await fs.realpath(folder);
    if (!(await fs.stat(actual)).isDirectory()) throw Error('Choose a project folder.');
    if (await isProtected(actual))
      throw Error(
        'Choose a dedicated project folder, such as Documents\\MyProject, instead of your user folder, Documents, Desktop, AppData or a drive root. Colab will not scan or initialize Git across those folders. Selected folder: ' +
          actual,
      );
    return actual;
  }
  return { assertProject, isProtected };
}
module.exports = { createProjectRootGuard };

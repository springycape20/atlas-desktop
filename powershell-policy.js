const path = require('node:path');
const quote = (value) => "'" + String(value).replace(/'/g, "''") + "'";
// This intentionally accepts a small, literal subset of PowerShell. Anything
// dynamic is sent to approval instead of guessing what it might execute.
function parse(command) {
  if (typeof command !== 'string' || !command.trim() || command.length > 12000)
    throw Error('Use a concrete PowerShell command under 12,000 characters.');
  const groups = [];
  let tokens = [],
    i = 0;
  const emit = (separator) => {
    if (!tokens.length) throw Error('Incomplete PowerShell command.');
    groups.push({ tokens, separator });
    tokens = [];
    if (groups.length > 8) throw Error('Use at most eight simple commands.');
  };
  while (i < command.length) {
    const char = command[i];
    if (/\s/.test(char)) {
      i++;
      continue;
    }
    if (char === '|' || char === ';') {
      emit(char);
      i++;
      continue;
    }
    let value = '',
      quoted = false;
    if (char === "'" || char === '"') {
      quoted = true;
      const q = char;
      i++;
      let ended = false;
      while (i < command.length) {
        const c = command[i++];
        if (c === q) {
          if (q === "'" && command[i] === q) {
            value += q;
            i++;
            continue;
          }
          ended = true;
          break;
        }
        if (q === '"' && /[$`]/.test(c)) throw Error('Interpolated strings require approval.');
        value += c;
      }
      if (!ended || (i < command.length && !/[\s|;]/.test(command[i])))
        throw Error('Complex quoting requires approval.');
    } else {
      while (i < command.length && !/[\s|;]/.test(command[i])) {
        const c = command[i++];
        if (/[&<>()[\]{}$`#'"\0]/.test(c))
          throw Error('Scripts, expressions, redirection and expansion require approval.');
        value += c;
      }
    }
    tokens.push({ value, quoted });
  }
  if (tokens.length) emit('');
  else if (groups.at(-1)?.separator === '|') throw Error('Incomplete pipeline.');
  return groups;
}
const management = 'Microsoft.PowerShell.Management\\',
  utility = 'Microsoft.PowerShell.Utility\\';
const common = { erroraction: 'literal' };
const specs = {
  'get-childitem': {
    module: management,
    path: 'optional',
    params: {
      recurse: 'switch',
      file: 'switch',
      directory: 'switch',
      force: 'switch',
      name: 'switch',
      hidden: 'switch',
      depth: 'number',
    },
  },
  'get-item': { module: management, path: 'required', params: { force: 'switch' } },
  'get-content': {
    module: management,
    path: 'required',
    params: {
      raw: 'switch',
      totalcount: 'number',
      head: 'number',
      tail: 'number',
      readcount: 'number',
      encoding: 'literal',
    },
  },
  'test-path': { module: management, path: 'required', params: { pathtype: 'literal' } },
  'set-content': {
    module: management,
    path: 'required',
    write: true,
    value: true,
    params: { encoding: 'literal', nonewline: 'switch' },
  },
  'add-content': {
    module: management,
    path: 'required',
    write: true,
    value: true,
    params: { encoding: 'literal', nonewline: 'switch' },
  },
  'new-item': { module: management, path: 'required', write: true, value: true, params: { itemtype: 'literal' } },
  'get-location': { module: management, params: {} },
  'get-date': { module: utility, params: { format: 'literal' } },
  'get-process': { module: management, positional: 'name', params: { name: 'literal', id: 'number' } },
  'get-service': { module: management, positional: 'name', params: { name: 'literal', displayname: 'literal' } },
  'select-string': {
    module: utility,
    path: 'pipeline',
    positional: 'pattern',
    params: {
      pattern: 'literal',
      simplematch: 'switch',
      casesensitive: 'switch',
      quiet: 'switch',
      list: 'switch',
      allmatches: 'switch',
    },
  },
  'select-object': {
    module: utility,
    positional: 'property',
    params: { property: 'literal', first: 'number', last: 'number', skip: 'number', unique: 'switch' },
  },
  'sort-object': {
    module: utility,
    positional: 'property',
    params: { property: 'literal', descending: 'switch', unique: 'switch' },
  },
  'format-table': {
    module: utility,
    positional: 'property',
    params: { property: 'literal', autosize: 'switch', hidetableheaders: 'switch', wrap: 'switch' },
  },
  'format-list': { module: utility, positional: 'property', params: { property: 'literal' } },
  'measure-object': {
    module: utility,
    positional: 'property',
    params: {
      property: 'literal',
      line: 'switch',
      word: 'switch',
      character: 'switch',
      sum: 'switch',
      minimum: 'switch',
      maximum: 'switch',
      average: 'switch',
    },
  },
  'convertto-json': { module: utility, params: { depth: 'number', compress: 'switch' } },
  'out-string': { module: utility, params: { width: 'number', stream: 'switch' } },
  'write-output': {
    module: utility,
    positional: 'inputobject',
    params: { inputobject: 'literal', noenumerate: 'switch' },
  },
};
const aliases = {
  ls: 'get-childitem',
  dir: 'get-childitem',
  gci: 'get-childitem',
  cat: 'get-content',
  gc: 'get-content',
  type: 'get-content',
  pwd: 'get-location',
  select: 'select-object',
  sort: 'sort-object',
  ft: 'format-table',
  fl: 'format-list',
  measure: 'measure-object',
  echo: 'write-output',
};
function parameters(tokens, spec) {
  const values = new Map(),
    positional = [],
    allowed = {
      ...common,
      ...spec.params,
      ...(spec.path ? { path: 'literal', literalpath: 'literal' } : {}),
      ...(spec.value ? { value: 'literal' } : {}),
    };
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token.quoted && /^-[a-z]/i.test(token.value)) {
      const name = token.value.slice(1).toLowerCase(),
        type = allowed[name];
      if (!type || values.has(name)) throw Error('This PowerShell option needs approval: ' + token.value);
      if (type === 'switch') values.set(name, true);
      else {
        const next = tokens[++i];
        if (!next || (!next.quoted && next.value.startsWith('-'))) throw Error('Use a literal option value.');
        if (type === 'number' && !/^\d{1,6}$/.test(next.value)) throw Error('Use a bounded numeric option.');
        values.set(name, next.value);
      }
    } else positional.push(token.value);
  }
  if (spec.path && positional.length && !values.has('path') && !values.has('literalpath'))
    values.set('literalpath', positional.shift());
  const field = spec.value ? 'value' : spec.positional;
  if (positional.length && field && !values.has(field)) values.set(field, positional.shift());
  if (positional.length) throw Error('Multiple implicit arguments require approval.');
  if (values.has('path') && values.has('literalpath')) throw Error('Use one file target.');
  return values;
}
async function scopeCommand(command, cwd) {
  if (typeof command !== 'string' || !cwd) throw Error('A command and working folder are required.');
  const root = await require('./desktop-action-policy').canonical(cwd);
  return management + 'Set-Location -LiteralPath ' + quote(root) + ' -ErrorAction Stop; ' + command;
}
async function assessPowerShell(args, cwd, { denied = [], env = process.env, assessFile }) {
  const paths = [];
  try {
    if (!cwd) throw Error('Select a working folder for automatic PowerShell commands.');
    const { canonical, canonicalDenials, inside } = require('./desktop-action-policy'),
      root = await canonical(cwd);
    denied = await canonicalDenials(denied);
    if (denied.some((file) => inside(file, root))) throw Error('This command uses a previously denied folder.');
    if (Object.keys(args).some((key) => !['command', 'timeout'].includes(key)))
      throw Error('Unknown PowerShell options require approval.');
    if (args.timeout !== undefined && (!Number.isInteger(args.timeout) || args.timeout < 1 || args.timeout > 120))
      throw Error('Use a PowerShell timeout between 1 and 120 seconds.');
    const groups = parse(args.command),
      output = [];
    for (let index = 0; index < groups.length; index++) {
      const group = groups[index],
        first = group.tokens[0];
      if (first.quoted) throw Error('Quoted or indirect commands require approval.');
      const raw = first.value.toLowerCase(),
        name = aliases[raw] || raw,
        spec = specs[name];
      if (!spec) {
        if (['remove-item', 'rm', 'del', 'erase', 'rmdir', 'rd', 'ri'].includes(name)) {
          try {
            const options = parameters(group.tokens.slice(1), {
                path: 'required',
                params: { recurse: 'switch', force: 'switch' },
              }),
              file = options.get('literalpath') || options.get('path');
            if (file) {
              const target = await assessFile({ mode: 'delete', path: file });
              paths.push(...target.paths);
            }
          } catch {}
        }
        throw Error(
          /^(?:remove|clear|stop|restart|disable|uninstall|format|set-acl|invoke|start-process|iex|rm|del|rmdir|reg|diskpart)/i.test(
            name,
          )
            ? 'This command can delete data, elevate privileges or change Windows settings. Approval is required.'
            : 'This command runs code or has effects that cannot be checked reliably. Approval is required.',
        );
      }
      const values = parameters(group.tokens.slice(1), spec),
        incoming = index > 0 && groups[index - 1].separator === '|';
      if (spec.path) {
        let file = values.get('literalpath') ?? values.get('path');
        if (!file && spec.path === 'optional') file = cwd;
        if (!file && !(spec.path === 'pipeline' && incoming)) throw Error('Use an explicit file path.');
        if (file) {
          if (/[*?\[\]]/.test(file) || /^(?:\\\\|\/\/|~)/.test(file) || file.includes(',') || file.includes('\0'))
            throw Error('Wildcard, remote or expanded file targets need approval.');
          const result = await assessFile({ mode: spec.write ? 'write' : 'read', path: file });
          paths.push(...result.paths);
          if (!result.auto) throw Error(result.reason);
          const actual = result.arguments.path;
          if (
            name === 'get-childitem' &&
            values.has('recurse') &&
            (await require('./project-root').createProjectRootGuard().isProtected(actual))
          )
            throw Error('Recursive scans of a whole user or system folder require approval.');
          if (spec.write && !inside(root, actual))
            throw Error('PowerShell changes outside the selected project need approval.');
          values.delete('path');
          values.delete('literalpath');
          if (name === 'new-item' && /[\[\]*?]/.test(actual))
            throw Error('This new-item target needs explicit approval.');
          values.set(name === 'new-item' ? 'path' : 'literalpath', actual);
        }
      }
      if (name === 'new-item' && !['file', 'directory'].includes(String(values.get('itemtype') || '').toLowerCase()))
        throw Error('Only ordinary files and folders can be created automatically. Links need approval.');
      if (name === 'select-string' && !values.has('pattern')) throw Error('Use a literal search pattern.');
      if (spec.path) values.delete('erroraction');
      const rendered = [spec.module + name];
      for (const [parameter, value] of values) {
        rendered.push('-' + parameter);
        if (value !== true) {
          if (parameter === 'property') {
            if (!/^[\w*,. -]+$/.test(value)) throw Error('Use plain property names.');
            rendered.push(value.split(',').map(quote).join(','));
          } else rendered.push(quote(value));
        }
      }
      if (spec.path) rendered.push('-ErrorAction Stop');
      output.push(rendered.join(' ') + group.separator);
    }
    return {
      auto: true,
      arguments: {
        ...args,
        command: management + 'Set-Location -LiteralPath ' + quote(root) + ' -ErrorAction Stop; ' + output.join(' '),
      },
      paths: [...new Set(paths)],
      reason: '',
    };
  } catch (error) {
    return { auto: false, arguments: args, paths: [...new Set(paths)], reason: error.message };
  }
}
// A command name where PowerShell or cmd would run it: at the start or after a separator, not inside
// another word, option or file name (so Format-Table, -Format and del.js don't count as format or del).
const commandNamed = (names) => new RegExp('(?:^|[\\s;|&({])(?:' + names + ')(?:\\.exe|\\.com)?(?=$|[\\s;|&)}])', 'i');
const risks = [
  [
    [/\b(?:remove-item|clear-content|clear-item|clear-recyclebin)\b/i, commandNamed('rm|ri|rd|rmdir|del|erase')],
    'This command deletes files or data.',
  ],
  [
    [
      /\b(?:HKLM|HKCU|HKCR|HKU|HKCC)(?::|\\)|\bHKEY_[A-Z_]+|\bRegistry::/i,
      /\b(?:set|new|remove|rename|clear|copy|move)-itemproperty\b/i,
      commandNamed('reg'),
    ],
    'This command changes the Windows registry.',
  ],
  [
    [
      /-verb\s+['"]?runas\b/i,
      /\b(?:set-executionpolicy|set-acl|(?:add|set|remove)-mppreference)\b/i,
      commandNamed('icacls|takeown|bcdedit|runas|sudo'),
      /(?:^|[\s;|&({])sc(?:\.exe)?\s+(?:config|delete|create|stop|failure|sdset)\b/i,
    ],
    'This command runs as administrator or changes Windows security settings.',
  ],
  [
    [
      /\b(?:format-volume|clear-disk|initialize-disk|remove-partition|stop-computer|restart-computer)\b/i,
      commandNamed('diskpart|format|shutdown|cipher|vssadmin|wevtutil'),
    ],
    'This command changes disks or shuts down or restarts the PC.',
  ],
  [
    [
      /\b(?:invoke-expression|frombase64string)\b/i,
      /\[scriptblock\]::create/i,
      commandNamed('iex'),
      /\s-e(?:c|nc\w*)?\s+['"]?[A-Za-z0-9+/=]{12,}/i,
    ],
    'This command runs hidden or encoded code that ATLAS cannot read.',
  ],
];
// For a chat that allows PowerShell: the reason a command must still ask, or '' when it may run. It scans the
// whole text, so a mention inside a string also asks; that only means asking more often. Programs the command
// starts (node, npm, python) are not inspected: what they do is what allowing the chat permits.
async function riskyPowerShell(command, cwd, { denied = [], env = process.env } = {}) {
  if (typeof command !== 'string' || !command.trim()) return 'Use a concrete PowerShell command.';
  for (const [patterns, reason] of risks) if (patterns.some((pattern) => pattern.test(command))) return reason;
  // PowerShell accepts C:/path as well as C:\path; compare both sides with backslashes.
  const slashes = (value) => value.toLowerCase().replaceAll('/', '\\'),
    text = slashes(command),
    system = [env.SystemRoot, env.windir, env.ProgramFiles, env['ProgramFiles(x86)']].filter(Boolean);
  if (
    /\b[a-z]:[\\/](?:windows|program files)(?:[\\/\s'"]|$)|\$env:(?:windir|systemroot|programfiles)|%(?:windir|systemroot|programfiles)/i.test(
      command,
    ) ||
    system.some((folder) => text.includes(slashes(folder)))
  )
    return 'This command touches Windows system or program files.';
  const { canonical, canonicalDenials, inside } = require('./desktop-action-policy'),
    root = cwd ? await canonical(cwd).catch(() => path.resolve(cwd)) : '';
  for (const file of await canonicalDenials(denied)) {
    const relative = root && inside(root, file) ? path.relative(root, file) : '';
    if ((root && inside(file, root)) || text.includes(slashes(file)) || (relative && text.includes(slashes(relative))))
      return 'This command uses a file or folder you denied before.';
  }
  // A denylist cannot understand PowerShell expansion or nested command languages.
  // Remembered permission covers literal syntax only; unknown syntax asks again.
  let groups;
  try {
    if (/[\r\n\u0000-\u001f]/.test(command)) throw Error('Use explicit command separators.');
    groups = parse(command);
  } catch {
    return 'Dynamic, escaped or unrecognised PowerShell syntax requires approval.';
  }
  for (const { tokens } of groups) {
    const name = tokens[0].value.toLowerCase();
    if (tokens[0].quoted || !/^[a-z][a-z0-9.-]*$/i.test(name)) return 'Indirect command names require approval.';
    if (
      /^(?:powershell|pwsh|cmd|wscript|cscript|mshta|bash|sh)(?:\.exe)?$/.test(name) ||
      (/^(?:node|python[\d.]*|ruby|perl)(?:\.exe)?$/.test(name) &&
        tokens
          .slice(1)
          .some((token) => /^(?:-[ecp]|--(?:eval|print|command|encodedcommand)(?:=|$))/i.test(token.value)))
    )
      return 'Nested shells and inline programs require approval.';
  }
  return '';
}
module.exports = { parse, assessPowerShell, scopeCommand, riskyPowerShell };

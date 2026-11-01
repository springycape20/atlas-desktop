(function (root) {
  function memo(cache, key, signature, create) {
    const old = cache.get(key);
    if (
      old &&
      old.signature.length === signature.length &&
      signature.every((value, i) => Object.is(value, old.signature[i]))
    )
      return old.value;
    const value = create();
    cache.set(key, { signature, value });
    return value;
  }
  function reconcile(parent, nodes) {
    let cursor = parent.firstChild;
    for (const node of nodes) {
      if (node === cursor) cursor = cursor.nextSibling;
      else parent.insertBefore(node, cursor);
    }
    while (cursor) {
      const next = cursor.nextSibling;
      cursor.remove();
      cursor = next;
    }
  }
  const ARCHIVED = '\0archived';
  // An archived chat stays out of the list unless you ask for it: under Archived, in a search, or while it is open.
  function chatVisible({ folder = '', archived = false }, filter, { searching = false, selected = false } = {}) {
    if (filter === ARCHIVED) return archived;
    if (filter && folder !== filter) return false;
    return !archived || searching || selected;
  }
  function fillFolderFilter(select, folders) {
    const value = select.value,
      names = [...new Set(folders.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    select.replaceChildren(
      new Option('All chats', ''),
      ...names.map((name) => new Option(name, name)),
      new Option('Archived', ARCHIVED),
    );
    select.value = value === ARCHIVED || names.includes(value) ? value : '';
  }
  const api = { memo, reconcile, ARCHIVED, chatVisible, fillFolderFilter };
  if (typeof module === 'object') module.exports = api;
  else root.atlasChatRender = api;
})(globalThis);

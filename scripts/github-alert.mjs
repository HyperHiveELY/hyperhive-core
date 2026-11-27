// The chain monitor and the private HTTP-health workflow use the same incident receiver.
export async function sendGitHubAlert({repository, token, assignees, key, title, body, openOnly = false}) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !token || !/^[\w.-]+$/.test(key)) {
    throw Error('Configure the private incident repository, credential and delivery key');
  }
  const recipients = (assignees || '').split(',').map(name => name.trim()).filter(Boolean);
  if (!recipients.length) throw Error('Configure incident assignees');
  const base = 'https://api.github.com/repos/' + repository;
  const headers = {Authorization:'Bearer ' + token, Accept:'application/vnd.github+json', 'Content-Type':'application/json'};
  async function request(path, options = {}) {
    const response = await fetch(base + path, {...options, headers, redirect:'error', signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw Error('Private incident receiver returned HTTP ' + response.status);
    return response.json();
  }
  const repo = await request('');
  if (!repo.private || repo.full_name.toLowerCase() !== repository.toLowerCase()) {
    throw Error('Incident destination must be the configured private repository');
  }
  function received(issue) {
    if (recipients.some(name => !issue.assignees.some(person => person.login.toLowerCase() === name.toLowerCase()))) {
      throw Error('One or more incident assignees could not be notified');
    }
    return issue.html_url;
  }
  const marker = '<!-- hyperhive-incident-' + key + ' -->';
  for (let page = 1; ; page++) {
    const issues = await request('/issues?state=' + (openOnly ? 'open' : 'all') + '&per_page=100&page=' + page);
    const existing = issues.find(issue => !issue.pull_request && issue.body?.includes(marker));
    if (existing) return received(existing);
    if (issues.length < 100) break;
  }
  const issue = await request('/issues', {method:'POST', body:JSON.stringify({title, body:body + '\n\n' + marker, assignees:recipients})});
  return received(issue);
}

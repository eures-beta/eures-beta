const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('assets/admin/admin-3.js', 'utf8');
const start = source.indexOf('    async function loadInitialAdminData()');
const initial = source.slice(start, source.indexOf('    loadInitialAdminData();', start));

test('tasks finish before statistics and background watchers; hidden panels stay idle', async () => {
  const calls = [];
  let releaseTasks;
  let releaseCockpit;
  const tasks = new Promise(resolve => { releaseTasks = resolve; });
  const cockpit = new Promise(resolve => { releaseCockpit = resolve; });
  const context = {
    loadTasks: () => { calls.push('tasks'); return tasks; },
    loadCockpit: () => { calls.push('cockpit'); return cockpit; },
    loadQuestionnaireResponses: async role => calls.push(role),
    startQuestionnaireAutoRefresh: () => calls.push('watch'),
  };
  for (const name of ['loadInvitations', 'loadMatchings', 'loadBrevoHealth']) {
    context[name] = () => { throw new Error(`Unexpected background load: ${name}`); };
  }
  vm.createContext(context);
  vm.runInContext(initial, context);
  const pending = context.loadInitialAdminData();
  assert.deepEqual(calls, ['tasks']);
  releaseTasks();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ['tasks', 'cockpit']);
  releaseCockpit();
  await pending;
  assert.deepEqual(calls, ['tasks', 'cockpit', 'candidate', 'employer', 'watch']);
});

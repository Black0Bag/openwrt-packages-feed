'use strict';

'require dom';
'require form';
'require fs';
'require poll';
'require rpc';
'require uci';
'require view';
'require ui';

var POLL_INTERVAL = 5;
var LOG_POLL_INTERVAL = 2;
var CHECK_CACHE_MS = 5 * 60 * 1000;

var RUNNING_SPAN   = '<span style="color: var(--success-color-high); font-weight: bold">%s</span>'.replace('%s', _('Running'));
var STOPPED_SPAN   = '<span style="color: var(--error-color-high); font-weight: bold">%s</span>'.replace('%s', _('Not running'));
var MISSING_BIN_SPAN = '<span style="color: var(--error-color-high); font-weight: bold">%s</span>'.replace('%s', _('Binary missing'));

var SERVICE = rpc.declare({
	object: 'service',
	method: 'list',
	params: [ 'name' ],
	expect: { memos: {} }
});

var cached_check = {
	ts: 0,
	promise: null,
	data: null
};

function getRunningState() {
	return SERVICE('memos').then(function (res) {
		var instances = res && res.instances;
		if (!instances)
			return false;
		// Prefer named instance "memos"; fall back to any running instance.
		if (instances.memos && instances.memos.running)
			return true;
		for (var key in instances) {
			if (Object.prototype.hasOwnProperty.call(instances, key) &&
			    instances[key] && instances[key].running)
				return true;
		}
		return false;
	}).catch(function () { return false; });
}

function getLocalVersion() {
	return fs.exec('/usr/share/memos/memos.sh', [ 'version' ]).then(function (res) {
		return (res && res.stdout ? res.stdout.trim() : '');
	}).catch(function () { return ''; });
}

// Protocol: state local remote arch  (local is "-" when missing)
function parseCheckOutput(out) {
	var parts = (out || '').trim().split(/\s+/);
	var state = parts[0] || 'unknown';
	var local = parts[1] || '';
	var remote = parts[2] || '';
	var arch = parts[3] || '';
	if (local === '-') local = '';
	if (remote === '-') remote = '';
	if (arch === '-') arch = '';
	return { state: state, local: local, remote: remote, arch: arch };
}

function getRemoteState(force) {
	var now = Date.now();
	if (!force && cached_check.promise && (now - cached_check.ts < CHECK_CACHE_MS) && (cached_check.ts > 0)) {
		return cached_check.promise;
	}

	cached_check.ts = now;
	cached_check.promise = fs.exec('/usr/share/memos/memos.sh', [ 'check' ]).then(function (res) {
		var out = (res && typeof res.stdout === 'string') ? res.stdout.trim() : '';
		var lines = out.split(/\r?\n/).filter(function (l) {
			return /^(uptodate|missing|outdated|error)\b/.test(l);
		});
		var last = lines.length ? lines[lines.length - 1] : out;
		var data = parseCheckOutput(last);
		if ([ 'uptodate', 'missing', 'outdated', 'error' ].indexOf(data.state) < 0)
			data.state = 'unknown';
		cached_check.data = data;
		return data;
	}).catch(function () {
		var data = { state: 'unknown', local: '', remote: '', arch: '' };
		cached_check.data = data;
		return data;
	});
	return cached_check.promise;
}

function findStatusOutput(node) {
	return node.querySelector('#cbi-memos-memos-_status output') ||
		node.querySelector('.cbi-value[data-name="_status"] output') ||
		node.querySelector('.cbi-value-field[id*="_status"] output');
}

return view.extend({
	load: function () {
		return uci.load('memos').then(function () {
			return Promise.all([
				getRunningState(),
				getLocalVersion(),
				getRemoteState(true)
			]);
		});
	},

	render: function (data) {
		var isRunning = data[0];
		var localVer = data[1];
		var remoteState = data[2];
		var port = uci.get('memos', 'memos', 'port') || '8081';
		var addr = uci.get('memos', 'memos', 'addr') || '';
		var unixSock = uci.get('memos', 'memos', 'unix_sock') || '';
		var enabled = uci.get('memos', 'memos', 'enabled');
		var map = new form.Map('memos', _('Memos'),
			_('Self-hosted note-taking. Binary is fetched from upstream on demand.'));

		var s = map.section(form.NamedSection, 'memos', 'memos');
		s.anonymous = true;
		s.addremove = false;

		var oStatus = s.option(form.DummyValue, '_status', _('Service Status'));
		oStatus.rawhtml = true;

		var oBin = s.option(form.DummyValue, '_binpath', _('Binary Path'));
		oBin.cfgvalue = function () {
			return uci.get('memos', 'memos', 'binpath') || '/usr/bin/memos';
		};

		var oLocal = s.option(form.DummyValue, '_localver', _('Local Version'));
		oLocal.rawhtml = true;

		var oRemote = s.option(form.DummyValue, '_remotever', _('Remote Version'));
		oRemote.rawhtml = true;

		var oArch = s.option(form.DummyValue, '_arch', _('Architecture'));

		var oAction = s.option(form.DummyValue, '_action', _('Binary Action'));
		oAction.rawhtml = true;

		var oOpen = s.option(form.DummyValue, '_open', _('Open Memos'));
		oOpen.rawhtml = true;

		var oLog = s.option(form.DummyValue, '_log', _('Update Log'));
		oLog.rawhtml = true;

		var actionHtml;
		if (remoteState.state === 'missing') {
			actionHtml = '<button id="btn-memos-action" type="button" class="cbi-button cbi-button-apply" data-op="download">' +
				_('Download binary') + '</button>';
		} else if (remoteState.state === 'outdated') {
			actionHtml = '<button id="btn-memos-action" type="button" class="cbi-button cbi-button-apply" data-op="update">' +
				_('Update to %s').replace('%s', remoteState.remote) + '</button>';
		} else if (remoteState.state === 'uptodate') {
			actionHtml = '<button id="btn-memos-action" type="button" class="cbi-button" disabled>' +
				_('Already up-to-date') + '</button>';
		} else {
			actionHtml = '<button id="btn-memos-action" type="button" class="cbi-button cbi-button-neutral" data-op="check">' +
				_('Check again') + '</button>';
		}

		// Always offer cancel so a stuck lock can be cleared after a partial run.
		actionHtml += ' <button id="btn-memos-cancel" type="button" class="cbi-button cbi-button-remove" data-op="cancel">' +
			_('Cancel update') + '</button>';

		var statusHtml;
		if (enabled !== '1') {
			statusHtml = STOPPED_SPAN + ' ' + _('(service disabled)');
		} else if (remoteState.state === 'missing' || !localVer) {
			statusHtml = MISSING_BIN_SPAN;
		} else {
			statusHtml = isRunning ? RUNNING_SPAN : STOPPED_SPAN;
		}

		var openHtml;
		if (unixSock) {
			openHtml = '<em>' + _('Unix socket mode — open via reverse proxy') + '</em>';
		} else {
			openHtml = '<button id="btn-memos-open" type="button" class="cbi-button" data-port="' + port +
				'" data-addr="' + addr + '">' + _('Open Memos') + '</button>';
		}

		var localHtml = localVer
			? ('<span style="color: var(--success-color-high)">' + localVer + '</span>')
			: ('<em>' + _('not installed') + '</em>');

		var remoteHtml;
		if (remoteState.state === 'unknown' || remoteState.state === 'error' || !remoteState.remote) {
			remoteHtml = '<em>' + _('unavailable') + '</em>';
		} else {
			remoteHtml = remoteState.remote;
		}

		var archHtml = remoteState.arch || '-';

		oStatus.cfgvalue = function () { return statusHtml; };
		oLocal.cfgvalue = function () { return localHtml; };
		oRemote.cfgvalue = function () { return remoteHtml; };
		oArch.cfgvalue = function () { return archHtml; };
		oAction.cfgvalue = function () { return actionHtml; };
		oOpen.cfgvalue = function () { return openHtml; };
		oLog.cfgvalue = function () {
			return '<pre id="memos-update-log" style="max-height: 240px; overflow: auto; font-size: 12px; line-height: 1.4; background: var(--background-color-low); border: 1px solid var(--border-color-medium); padding: 8px;"></pre>';
		};

		return map.render().then(function (node) {
			var btn = node.querySelector('#btn-memos-action');
			if (btn) {
				btn.addEventListener('click', function (ev) { handleAction(ev); });
			}
			var cancelBtn = node.querySelector('#btn-memos-cancel');
			if (cancelBtn) {
				cancelBtn.addEventListener('click', function (ev) { handleAction(ev); });
			}
			var openBtn = node.querySelector('#btn-memos-open');
			if (openBtn) {
				openBtn.addEventListener('click', function () {
					var p = openBtn.getAttribute('data-port') || port;
					var a = openBtn.getAttribute('data-addr') || '';
					var host = (a && a !== '0.0.0.0' && a !== '::' && a !== '[::]')
						? a
						: window.location.hostname;
					if (host.indexOf(':') >= 0 && host.charAt(0) !== '[')
						host = '[' + host + ']';
					window.open('http://' + host + ':' + p, '_blank');
				});
			}

			poll.add(function () {
				return getRunningState().then(function (running) {
					var out = findStatusOutput(node);
					if (!out)
						return;
					var html;
					if (enabled !== '1') {
						html = STOPPED_SPAN + ' ' + _('(service disabled)');
					} else if (!localVer && remoteState.state === 'missing') {
						html = MISSING_BIN_SPAN;
					} else {
						html = running ? RUNNING_SPAN : STOPPED_SPAN;
					}
					dom.content(out, html);
				});
			}, POLL_INTERVAL);

			poll.add(function () { return updateLogView(node); }, LOG_POLL_INTERVAL);

			return node;
		});
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});

function handleAction(ev) {
	var btn = ev.currentTarget;
	var op = btn.getAttribute('data-op');

	if (op === 'check') {
		btn.disabled = true;
		btn.textContent = _('Checking...');
		cached_check = { ts: 0, promise: null, data: null };
		getRemoteState(true).finally(function () {
			location.reload();
		});
		return;
	}

	if (op === 'cancel') {
		btn.disabled = true;
		btn.textContent = _('Cancelling...');
		fs.exec('/usr/share/memos/memos.sh', [ 'cancel' ]).finally(function () {
			cached_check = { ts: 0, promise: null, data: null };
			location.reload();
		});
		return;
	}

	if (op !== 'download' && op !== 'update') {
		return;
	}

	var originalLabel = btn.textContent;
	btn.disabled = true;
	btn.textContent = _('Working...');

	fs.exec('/usr/share/memos/memos.sh', [ op ]).then(function (res) {
		cached_check = { ts: 0, promise: null, data: null };
		var code = res && typeof res.code === 'number' ? res.code : 0;
		if (code !== 0) {
			var err = (res && res.stderr) ? res.stderr.trim() : '';
			ui.addNotification(null, E('p', {}, err || _('Update failed. See the update log below.')), 'error');
			btn.disabled = false;
			btn.textContent = originalLabel;
			return;
		}
		location.reload();
	}).catch(function () {
		cached_check = { ts: 0, promise: null, data: null };
		ui.addNotification(null, E('p', {}, _('Update failed. See the update log below.')), 'error');
		btn.disabled = false;
		btn.textContent = originalLabel;
	});
}

var last_log_offset = 0;
function updateLogView(rootNode) {
	var pre = rootNode && rootNode.querySelector('#memos-update-log');
	if (!pre) {
		return Promise.resolve();
	}
	return fs.read('/tmp/memos_update.log').then(function (content) {
		if (!content) { content = ''; }
		if (content.length < last_log_offset) {
			last_log_offset = 0;
			pre.textContent = '';
		}
		var fresh = content.slice(last_log_offset);
		last_log_offset = content.length;
		if (fresh.length === 0) {
			if (!pre.textContent) {
				pre.textContent = _('(no update running)');
			}
			return;
		}
		var txt = pre.textContent;
		if (txt === _('(no update running)')) { txt = ''; }
		pre.textContent = txt + fresh;
		pre.scrollTop = pre.scrollHeight;
	}).catch(function () { /* file missing */ });
}

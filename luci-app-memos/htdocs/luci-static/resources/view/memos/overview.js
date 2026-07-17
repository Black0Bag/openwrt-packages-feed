'use strict';

'require dom';
'require fs';
'require poll';
'require rpc';
'require uci';
'require view';
'require form';

var POLL_INTERVAL = 5;          // seconds between status polls
var LOG_POLL_INTERVAL = 2;      // seconds between download-log polls
var CHECK_CACHE_MS = 5 * 60 * 1000;  // 5 min client-side cache of the check call

var RUNNING_SPAN   = '<span style="color: var(--success-color-high); font-weight: bold">%s</span>'.replace('%s', _('Running'));
var STOPPED_SPAN   = '<span style="color: var(--error-color-high); font-weight: bold">%s</span>'.replace('%s', _('Not running'));
var DOWNLOADING_SPAN = '<span style="color: var(--warning-color-high); font-weight: bold">%s</span>'.replace('%s', _('Downloading...'));
var MISSING_BIN_SPAN = '<span style="color: var(--error-color-high); font-weight: bold">%s</span>'.replace('%s', _('Binary missing'));

var SERVICE = rpc.declare({
	object: 'service',
	method: 'list',
	params: [ 'name' ],
	expect: { memos: { instances: { memos: {} } } }
});

// cached remote-check result so we don't hammer GitHub on every render/poll
var cached_check = {
	ts: 0,
	promise: null,
	data: null
};

function getRunningState() {
	return SERVICE('memos').then(function (res) {
		return !!(res && res.instances && res.instances.memos && res.instances.memos.running);
	}).catch(function () { return false; });
}

function getLocalVersion(binpath) {
	return fs.exec(binpath || '/usr/bin/memos', [ 'version' ]).then(function (res) {
		// memos prints just the version number, e.g. 0.29.1
		return (res && res.stdout ? res.stdout.trim() : '');
	}).catch(function () { return ''; });
}

// Run memos.sh check. Returns one of:
//  { state: 'uptodate' | 'missing' | 'outdated' | 'unknown', local, remote, arch }
function getRemoteState(force) {
	var now = Date.now();
	if (!force && cached_check.promise && (now - cached_check.ts < CHECK_CACHE_MS) && (cached_check.ts > 0)) {
		return cached_check.promise;
	}

	cached_check.ts = now;
	cached_check.promise = fs.exec('/usr/share/memos/memos.sh', [ 'check' ]).then(function (res) {
		var out = (res && typeof res.stdout === 'string') ? res.stdout.trim() : '';
		var parts = out.split(/\s+/);
		var data = { state: parts[0] || 'unknown', local: parts[1] || '', remote: parts[2] || '', arch: parts[3] || '' };
		cached_check.data = data;
		return data;
	}).catch(function () {
		var data = { state: 'unknown', local: '', remote: '', arch: '' };
		return data;
	});
	return cached_check.promise;
}

function renderStatus(map) {
	var s = map.section(form.NamedSection, 'memos', 'memos');
	s.anonymous = true;
	s.addremove = false;

	var oStatus = s.option(form.DummyValue, '_status', _('Service Status'));
	oStatus.rawhtml = true;

	var oBin = s.option(form.DummyValue, '_binpath', _('Binary Path'));
	oBin.cfgvalue = function () { return uci.get('memos', 'memos', 'binpath') || '/usr/bin/memos'; };

	var oLocal = s.option(form.DummyValue, '_localver', _('Local Version'));
	oLocal.rawhtml = true;

	var oRemote = s.option(form.DummyValue, '_remotever', _('Remote Version'));
	oRemote.rawhtml = true;

	var oAction = s.option(form.DummyValue, '_action', _('Binary Action'));
	oAction.rawhtml = true;

	var oOpen = s.option(form.DummyValue, '_open', _('Open Memos'));
	oOpen.rawhtml = true;

	return s;
}

return view.extend({
	load: function () {
		return Promise.all([
			getRunningState(),
			getLocalVersion(uci.get('memos', 'memos', 'binpath') || '/usr/bin/memos'),
			getRemoteState(true)
		]);
	},

	render: function (data) {
		var isRunning = data[0];
		var localVer = data[1];
		var remoteState = data[2];
		var port = uci.get('memos', 'memos', 'port') || '8081';
		var binpath = uci.get('memos', 'memos', 'binpath') || '/usr/bin/memos';
		var enabled = uci.get('memos', 'memos', 'enabled');
		var map = new form.Map('memos', _('Memos'), _('Self-hosted note-taking. Binary is fetched from upstream on demand.'));

		var statusSect = renderStatus(map);
		var statusNode, binNode, localNode, remoteNode, actionNode, openNode;

		// Compute the initial action button label based on remote-state.
		var actionHtml;
		if (remoteState.state === 'missing') {
			actionHtml = '<button id="btn-memos-action" type="button" class="cbi-button cbi-button-apply" data-op="download">' + _('Download binary') + '</button>';
		} else if (remoteState.state === 'outdated') {
			actionHtml = '<button id="btn-memos-action" type="button" class="cbi-button cbi-button-apply" data-op="update">' +
				_('Update to %s').replace('%s', remoteState.remote) + '</button>';
		} else if (remoteState.state === 'uptodate') {
			actionHtml = '<button id="btn-memos-action" type="button" class="cbi-button" disabled>' + _('Already up-to-date') + '</button>';
		} else if (remoteState.state === 'unknown') {
			actionHtml = '<button id="btn-memos-action" type="button" class="cbi-button cbi-button-neutral" data-op="check">' + _('Check again') + '</button>';
		} else {
			actionHtml = '-';
		}

		var statusHtml;
		if (enabled !== '1') {
			statusHtml = STOPPED_SPAN + ' ' + _('(service disabled)');
		} else if (remoteState.state === 'missing') {
			statusHtml = MISSING_BIN_SPAN;
		} else {
			statusHtml = isRunning ? RUNNING_SPAN : STOPPED_SPAN;
		}

		var openHtml = '<button id="btn-memos-open" type="button" class="cbi-button" data-port="' + port + '">' + _('Open Memos') + '</button>';

		var localHtml = localVer
			? ('<span style="color: var(--success-color-high)">' + localVer + '</span>')
			: ('<em>' + _('not installed') + '</em>');

		var remoteHtml;
		if (remoteState.state === 'unknown' || !remoteState.remote) {
			remoteHtml = '<em>' + _('unavailable') + '</em>';
		} else {
			remoteHtml = remoteState.remote;
		}

		// Patch cfgvalues into the DummyValue options we declared.
		// form.DummyValue with rawhtml + a node id lets poll update it later.
		statusSect.children.forEach(function (opt) {
			switch (opt.option) {
			case '_status':   opt.cfgvalue = function () { return statusHtml; };   break;
			case '_binpath':  break;
			case '_localver': opt.cfgvalue = function () { return localHtml; };    break;
			case '_remotever':opt.cfgvalue = function () { return remoteHtml; };   break;
			case '_action':   opt.cfgvalue = function () { return actionHtml; };   break;
			case '_open':     opt.cfgvalue = function () { return openHtml; };     break;
			}
		});

		// Append a live-log section shown only while a download/update is in flight.
		var logSect = map.section(form.NamedSection, 'memos', 'memos');
		logSect.anonymous = true;
		var oLog = logSect.option(form.DummyValue, '_log', _('Update Log'));
		oLog.rawhtml = true;
		oLog.cfgvalue = function () {
			return '<pre id="memos-update-log" style="max-height: 240px; overflow: auto; font-size: 12px; line-height: 1.4; background: var(--background-color-low); border: 1px solid var(--border-color-medium); padding: 8px;"></pre>';
		};

		return map.render().then(function (node) {
			// Wire up the action button + live log polling now that the DOM exists.
			var btn = node.querySelector('#btn-memos-action');
			if (btn) {
				btn.addEventListener('click', function (ev) { handleAction(ev, node); });
			}
			var openBtn = node.querySelector('#btn-memos-open');
			if (openBtn) {
				openBtn.addEventListener('click', function () {
					var p = openBtn.getAttribute('data-port') || port;
					window.open('http://' + window.location.hostname + ':' + p, '_blank');
				});
			}

			// Start polling running state.
			poll.add(function () {
				return getRunningState().then(function (running) {
					var out = node.querySelector('[data-field="_status"] output, [data-field-id="_status"] output, output[data-field="_status"]');
					// Fallback query if exact attribute differs:
					if (!out) {
						out = node.querySelector('.cbi-value-field[id*="_status"] output, .cbi-value-field[id$="_status"] output, #cbi-memos-memos-_status output');
					}
					if (out) {
						var html = (remoteState.state === 'missing' && enabled !== '0') ? MISSING_BIN_SPAN : (running ? RUNNING_SPAN : STOPPED_SPAN);
						if (enabled !== '1') {
							html = STOPPED_SPAN + ' ' + _('(service disabled)');
						}
						dom.content(out, html);
					}
				});
			}, POLL_INTERVAL);

			// Start polling the update log (cheap when no update is running: file empty).
			poll.add(function () { updateLogView(node); }, LOG_POLL_INTERVAL);

			return node;
		});
	}
});

// --- action handler ----------------------------------------------------
function handleAction(ev, rootNode) {
	var btn = ev.currentTarget;
	var op = btn.getAttribute('data-op');
	if (op === 'check') {
		// Force a fresh check.
		btn.disabled = true;
		btn.textContent = _('Checking...');
		cached_check = { ts: 0, promise: null, data: null };
		getRemoteState(true).then(function (state) {
			location.reload();
		});
		return;
	}
	if (op !== 'download' && op !== 'update') {
		return;
	}

	btn.disabled = true;
	btn.textContent = _('Working...');

	// fs.exec blocks until the script exits. For a download this is a long call
	// (multi-second), but the Luci fs.exec already streams stdout; we rely on
	// the log poller below to surface progress from /tmp/memos_update.log.
	fs.exec('/usr/share/memos/memos.sh', [ op ]).then(function (res) {
		// Success or failure - we always refetch check + reload the page.
		cached_check = { ts: 0, promise: null, data: null };
		location.reload();
	}).catch(function () {
		cached_check = { ts: 0, promise: null, data: null };
		location.reload();
	});
}

// --- live log ----------------------------------------------------------
var last_log_offset = 0;
function updateLogView(rootNode) {
	var pre = rootNode && rootNode.querySelector('#memos-update-log');
	if (!pre) {
		// First-time render: structure not yet ready, wait for next tick.
		return Promise.resolve();
	}
	// Read the update log via fs.readfile - cheap when empty.
	fs.read('/tmp/memos_update.log').then(function (content) {
		if (!content) { content = ''; }
		// Only append new bytes since last render.
		if (content.length < last_log_offset) {
			// Log was truncated/replaced - reset.
			last_log_offset = 0;
		}
		var fresh = content.slice(last_log_offset);
		last_log_offset = content.length;
		if (fresh.length === 0) {
			// Show a placeholder line so the box isn't empty/confusing.
			if (!pre.textContent) {
				pre.textContent = _('(no update running)');
			}
			return;
		}
		// Prepend fresh text to keep the visual order natural.
		var txt = pre.textContent;
		if (txt === _('(no update running)')) { txt = ''; }
		pre.textContent = txt + fresh;
		// Auto-scroll the pre to the bottom so the latest line is visible.
		pre.scrollTop = pre.scrollHeight;
		return;
	}).catch(function () { /* file missing or not readable yet */ });
}
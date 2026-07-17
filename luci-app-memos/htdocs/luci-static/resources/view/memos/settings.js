'use strict';

'require form';
'require view';

// LuCI Configuration page for memos.
//
// The General / Database / Advanced tabs map directly to memos' CLI flags
// (see cmd/memos/main.go in usememos/memos). memos reads these only via the
// argv the init.d script assembles; there is no memos-side config file.

var ALLOWED_PORTS_RE = /^[1-9][0-9]{0,4}$/;
var PATH_ABS_RE     = /^\/[^:]*$/;

return view.extend({
	render: function () {
		var map = new form.Map('memos', _('Memos - Settings'),
			_('Settings are passed to the memos binary as command-line flags by the init script. \
Some options (driver, mirror, release channel) only affect how the package downloads or runs memos and are not memos CLI flags themselves.'));

		var s = map.section(form.NamedSection, 'memos', 'memos');
		s.addremove = false;
		s.anonymous = true;

		s.tab('general',  _('General'));
		s.tab('database', _('Database'));
		s.tab('download', _('Download Mirror'));
		s.tab('advanced', _('Advanced'));

		// --- General ----------------------------------------------------------
		var oEnabled = s.taboption('general', form.Flag, 'enabled', _('Enabled'),
			_('Enable the memos service. When disabled, the init script will not start memos.'));
		oEnabled.default = '0';
		oEnabled.rmempty = false;

		var oAddr = s.taboption('general', form.Value, 'addr', _('Listen address'),
			_('Address the HTTP server binds to. Empty means all interfaces (0.0.0.0).'));
		oAddr.datatype = 'ipaddr';
		oAddr.placeholder = '0.0.0.0';

		var oPort = s.taboption('general', form.Value, 'port', _('Listen port'),
			_('Port the HTTP server listens on. Overridden if a Unix socket is configured.'));
		oPort.datatype = 'port';
		oPort.default  = '8081';
		oPort.validate = function (section_id, value) {
			if (!value) return true; // let default kick in
			return ALLOWED_PORTS_RE.test(value) ? true : _('Port must be a number between 1 and 65535.');
		};

		var oData = s.taboption('general', form.Value, 'data', _('Data directory'),
			_('Where memos stores its SQLite database and uploaded attachments. \
Must be on a writable, persistent filesystem; data on a tmpfs will be lost on reboot.'));
		oData.placeholder = '/etc/memos';
		oData.validate = function (section_id, value) {
			if (!value) return true;
			return PATH_ABS_RE.test(value) ? true : _('Path must be absolute.');
		};

		var oBin = s.taboption('general', form.Value, 'binpath', _('Binary path'),
			_('Where the downloaded memos binary is stored. Re-download via the Overview page.'));
		oBin.placeholder = '/usr/bin/memos';
		oBin.validate = function (section_id, value) {
			if (!value) return true;
			return PATH_ABS_RE.test(value) ? true : _('Path must be absolute.');
		};

		var oLogLevel = s.taboption('general', form.ListValue, 'log_level', _('Log level'),
			_('Verbosity of the memos log output (sent to syslog by procd).'));
		oLogLevel.value('debug', 'debug');
		oLogLevel.value('info',  'info');
		oLogLevel.value('warn',  'warn');
		oLogLevel.value('error', 'error');
		oLogLevel.default = 'info';

		// --- Database --------------------------------------------------------
		var oDriver = s.taboption('database', form.ListValue, 'driver', _('Database driver'),
			_('SQLite needs no extra packages and is the default for router scenarios.'));
		oDriver.value('sqlite',  'SQLite (embedded, recommended)');
		oDriver.value('mysql',   'MySQL / MariaDB');
		oDriver.value('postgres', 'PostgreSQL');
		oDriver.default = 'sqlite';

		var oDsn = s.taboption('database', form.Value, 'dsn', _('DSN'),
			_('Database source name for the chosen driver. Required when driver is not SQLite. \
Example (MySQL): user:pass@tcp(127.0.0.1:3306)/memos?parseTime=true \
Example (Postgres): postgres://user:pass@127.0.0.1:5432/memos?sslmode=disable'));
		oDsn.depends('driver', 'mysql');
		oDsn.depends('driver', 'postgres');
		oDsn.placeholder = 'user:pass@tcp(127.0.0.1:3306)/memos';

		// --- Download mirror -------------------------------------------------
		// Issue #5 outcome from the plan: provide a few preset GitHub mirrors in
		// China plus a custom fallback.
		var oMirror = s.taboption('download', form.ListValue, 'mirror', _('Download mirror'),
			_('When GitHub is not reachable from your region, pick a mirror prefix to proxy \
download URLs and the releases API. Mirror availability is not guaranteed; switch to \
"Custom" to enter any working prefix if the built-in ones stop working.'));
		oMirror.value('official',  _('Official (direct GitHub)'));
		oMirror.value('ghproxy',   _('ghproxy.com'));
		oMirror.value('gh-proxy',   _('gh-proxy.com'));
		oMirror.value('gitmirror',  _('hub.gitmirror.com'));
		oMirror.value('moeyy',      _('github.moeyy.xyz'));
		oMirror.value('custom',     _('Custom'));
		oMirror.default = 'official';

		var oCustom = s.taboption('download', form.Value, 'mirror_custom', _('Custom mirror prefix'),
			_('A prefix prepended to github.com URLs. Must end with "/". \
Leave empty to disable the custom prefix.'));
		oCustom.depends('mirror', 'custom');
		oCustom.placeholder = 'https://ghproxy.com/';
		oCustom.validate = function (section_id, value) {
			if (!value) return true;
			if (!/^https?:\/\/[^/].*\/$/.test(value)) {
				return _('Must be a full URL ending with "/".');
			}
			return true;
		};

		var oChannel = s.taboption('download', form.ListValue, 'release_channel', _('Release channel'),
			_('Stable points at the GitHub releases/latest endpoint (recommended). \
Beta pulls the newest release (including pre-releases) for those who want to test.'));
		oChannel.value('stable', _('Stable'));
		oChannel.value('beta',   _('Beta / pre-release'));
		oChannel.default = 'stable';

		var oCron = s.taboption('download', form.Flag, 'cron_autoupdate', _('Daily auto-update'),
			_('Install a daily 3:30 AM cron job that runs memos.sh update. \
Only the memos binary is replaced; your data is untouched.'));
		oCron.default = '0';
		oCron.rmempty = false;

		// --- Advanced --------------------------------------------------------
		var oInstance = s.taboption('advanced', form.Value, 'instance_url', _('Instance URL'),
			_('Public URL of your memos instance, e.g. https://memos.example.com. \
Setting this enables the "public" access mode (anonymous read access).'));
		oInstance.placeholder = 'https://memos.example.com';

		var oUnix = s.taboption('advanced', form.Value, 'unix_sock', _('Unix socket'),
			_('Path to a Unix socket; takes precedence over --addr and --port.'));
		oUnix.placeholder = '/var/run/memos.sock';
		oUnix.validate = function (section_id, value) {
			if (!value) return true;
			return PATH_ABS_RE.test(value) ? true : _('Path must be absolute.');
		};

		var oDemo = s.taboption('advanced', form.Flag, 'demo', _('Demo mode'),
			_('Enable memos\' built-in demo mode. Seeded data, intended for testing only.'));
		oDemo.default = '0';
		oDemo.rmempty = false;

		var oPriv = s.taboption('advanced', form.Flag, 'allow_private_webhooks', _('Private webhooks'),
			_('Allow webhook URLs to resolve to private / reserved IP ranges. Off by default.'));
		oPriv.default = '0';
		oPriv.rmempty = false;

		var oUser = s.taboption('advanced', form.Value, 'user', _('Run as user'),
			_('Drop privileges to this user before exec. Empty = root. Make sure the data dir is writable by this user.'));
		oUser.placeholder = 'memos';

		var oGroup = s.taboption('advanced', form.Value, 'group', _('Run as group'),
			_('Drop privileges to this group before exec. Empty = root.'));
		oGroup.placeholder = 'memos';

		var oGc = s.taboption('advanced', form.Value, 'gc', _('GOGC'),
			_('Go garbage-collector aggressiveness (heap growth percentage). Empty = unset/100.'));
		oGc.datatype = 'uinteger';
		oGc.placeholder = '100';

		var oMax = s.taboption('advanced', form.Value, 'maxprocs', _('GOMAXPROCS'),
			_('Maximum number of OS threads for Go user code. Empty = match available CPUs.'));
		oMax.datatype = 'uinteger';
		oMax.placeholder = '4';

		var oMem = s.taboption('advanced', form.Value, 'memlimit', _('GOMEMLIMIT (MiB)'),
			_('Soft memory limit for the Go runtime in MiB. Empty = no limit.'));
		oMem.datatype = 'uinteger';
		oMem.placeholder = '0';

		return map.render();
	}
});

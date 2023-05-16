const http = require('http');
const uuid = require('ordered-uuid-v4-fixed');
const {exec} = require('child_process');
const standard_port = 5555;
const port = process.env.PORT || standard_port; //  work on custom port at dev stage
const supported_platforms = {
	'linux': {name: 'Debian/Ubuntu', stage: 'prod', network_interface_terminal: 'wlan1', network_interface_mesh: 'wlan0'}, 
	'win32': {name: 'Windows 32/64', stage: 'test', network_interface_terminal: '', network_interface_mesh: ''},
	'darwin': {name: 'MacOS', stage: 'dev', network_interface_terminal: 'en0', network_interface_mesh: 'en0'},
};
const {LOCAL_RUN} = process.env;
const history = {messages: {}, events: {}};
const broadcast_target_nodes = { // mesh node: name -> ipv6 url
	'node1': 'http://[::1]:5001/',
	'node2': 'http://[::1]:5002/',
	'node3': 'http://[::1]:5003/',
}; // TODO: raplace hardcode by assignment and autodetection
async function getMyIPv(version, interface) {
	let processGetIp = () => {
		return new Promise((resolve, reject) => {
			function handleGetIp(error, stdout, stderr) {
				if (error || stderr) {
					stderr && console.log(`stderr: ${stderr}`);
					error && console.log(`error: ${error.message}`);
					reject(stderr);
				} else {
					let result = stdout.split('\n')[0];
					if (version === 6 && process.platform === 'linux')
						result += `%${interface}`;
					console.log(`stdout: ${result}`);
					resolve(result);
				}
			}
			exec(`ifconfig ${interface} | grep "inet${version === 6 ? '6' : ''} " | awk '{print $2}'`, handleGetIp);
		});
	};
	return await processGetIp();
}
async function curl(url) {
	const process_curl = () => {
		return new Promise((resolve, reject) => {
			function handle_curl(error, stdout, stderr) {
				if (error) {
					stderr && console.log(`stderr: ${stderr}`);
					error && console.log(`error: ${error.message || error}`);
					reject(error);
				} else {
					console.log(`stdout: ${stdout}`);
					resolve(stdout);
				}
			}
			exec(`curl --request GET --url '${url}'`, handle_curl);
		});
	};
	return await process_curl();
}
function getAddressUrl(a) {
	const {family, address, port} = a.address();
	if (family === 'IPv6') {
		if (process.platform === 'win32')
			return `http://[${address.split('%')[0]}]:${port}/`;
		return `http://[${address}]:${port}/`;
	}
	return `http://${address}:${port}/`;
}
function getAddressDescription(a) {
	const url = getAddressUrl(a);
	const {family} = a.address();
	return `${family} ${url}`;
}
async function run() {
	async function ping(url) {
		let text = null;
		try {
			text = await curl(url);
		}
		catch (error) {
			text = error;
		}
		return text;
	}
	async function ping_wrap(url) {
		return `hello IPv4! and bridge says: ${await ping(url)}. @ ${ipv4}:${port}`;
	}
	
	if (!(process.platform in supported_platforms)) {
		process.exit(1);
	}
	const {name, stage, network_interface_terminal, network_interface_mesh} = supported_platforms[process.platform];
	console.log(`platform detected: ${process.platform} (${name}), stage ${stage}`);
	const ipv4 = LOCAL_RUN ? '127.0.0.1' : await getMyIPv(4, network_interface_terminal);
	const ipv6 = LOCAL_RUN ? '::1' : await getMyIPv(6, network_interface_mesh);
	const a = http.createServer(async (req, res) => {
		const urlParts = req.url.split('?');
		const apiMethod = urlParts[0];
		const apiParameter = urlParts[1];
		if (apiMethod === '/broadcast') {
			res.writeHead(200, { "Content-Type": "text/html" });
			const parts = apiParameter.split('&');
			const id = parts[0];
			if (id in history.messages) {
				res.end('stopped');
				return;
			}
			const message = parts[1];
			history.messages[id] = message;
			for (let node in broadcast_target_nodes)
				await ping(`${broadcast_target_nodes[node]}broadcast?${id}&${message}`);
			res.end('sent');
		}
		else {
			console.log(`incoming ipv6 ping - [${ipv6}]:${port}`);
			res.writeHead(200, { "Content-Type": "text/html" });
			res.end(`hello IPv6! @ [${ipv6}]:${port}`);	
		}
	}).listen(port, ipv6, () => console.log(`run at ${getAddressDescription(a)}`));
	const b = http.createServer(async (req, res) => {
		const urlParts = req.url.split('?');
		const apiMethod = urlParts[0];
		const apiParameter = urlParts[1];
		if (apiMethod === '/') {
			res.writeHead(200, { "Content-Type": "text/html" });
			res.end(`
				<div>${await ping_wrap(getAddressUrl(a))}</div>
				<div>
					<input id="ipv6_1" value="::1"><input id="port_1" value="5555">
					<button onclick="onclick_button(1);">ping</button>
				</div>
				<div>
					<input id="ipv6_2" value="::1"><input id="port_2" value="5555">
					<button onclick="onclick_button(2);">ping</button>
				</div>
				<p><input id="message"><button onclick="onclick_send();">send</button></p>
				<p>chat history <button onclick="onclick_refresh();">refresh</button></p>
				<div id="chat_history"></div>
				<script>
					class CombUUID {
						static encode(now = new Date()) {
							if (!(now instanceof Date)) {
								now = new Date(now);
							}
							// timestamp
							const timestamp_js = now.getTime();
							const timestamp_bin = timestamp_js * 100;
							const timestamp_hex = timestamp_bin.toString(16);
							const ts1 = timestamp_hex.substring(0, 8);
							const ts2 = timestamp_hex.substring(8, 13);
							// version
							const version = '4';
							const variant = 'b';
					
							// random
							
							// node.js version//
							//const bytes = crypto.randomBytes(18).toString("hex");
							////
							
							// browser version //
							const raw_bytes = new Uint8Array(18);
							crypto.getRandomValues(raw_bytes);
							let bytes = '';
							raw_bytes.forEach(b => bytes += b.toString(16).padStart(2, '0'));
							////

							const r1 = bytes.substring(0,3);
							const r2 = bytes.substring(3,6);
							const r3 = bytes.substring(6,18);
							return \`\${ts1}-\${ts2}-\${version}\${r1}-\${variant}\${r2}-\${r3}\`;
						}
						static decode(uuid) {
							const uuid_hex = \`\${uuid}\`.toLowerCase().replace(/[^0-9a-f]/g, ''); // string all non-hex characters
							if (uuid_hex.length !== 32) {
								throw new Error('Invalid UUID not length 32 when non-hex characters removed');
							}
							// timestamp
							const timestamp_hex = uuid_hex.substring(0, 12);
							const timestamp = parseInt(timestamp_hex, 16);
							const timestamp_ms = timestamp / 100;
							const timestamp_js = new Date(timestamp_ms);
							// version
							const version = uuid_hex.substring(12, 13);
							const variant = uuid_hex.substring(16, 17);
							// random
							const random = \`\${uuid_hex.substring(13,16)}\${uuid_hex.substring(17)}\`;

							return {
								version,
								variant,
								timestamp,
								timestamp_js,
								random,
							};
						}
					}
				</script>
				<script>
					const history = {locals: {}, errors: {}};
					async function onclick_button(id) {
						const ipv6 = document.getElementById('ipv6_' + id).value;
						const port = document.getElementById('port_' + id).value;
						try {
							const response = await fetch(location.href + 'ping?http://[' + ipv6 + ']:' + port + '/');
						}
						catch(e) {
							history.errors[CombUUID.encode()] = e.message + ' >> ' + e.stack;
						}
						await onclick_refresh();
					}
					async function onclick_refresh() {
						let events = {}, messages = {}, errors = history.errors;
						try {
							const response = await fetch(location.href + 'history');
							const h = await response.json();
							events = h.events;
							messages = h.messages
						}
						catch (e) {
							history.errors[CombUUID.encode()] = e.message + ' >> ' + e.stack;
						}
						const listElement = document.getElementById('chat_history');
						listElement.innerHTML = '';
						const records = {};
						Object.assign(records, events, messages, errors, history.locals);
						const list = Object.keys(records).sort();
						list.forEach(uuid => {
							const recordElement = document.createElement('div');
							recordElement.id = uuid;
							recordElement.textContent = records[uuid];
							recordElement.style.color = (uuid in errors) ? 'red'
								: (uuid in events) ? 'orange'
									: (uuid in messages) ? 'black'
										: 'gray';
							listElement.append(recordElement);
						});
						history.locals = records;
					}
					async function onclick_send() {
						const message = document.getElementById('message').value;
						if (!message)
							return;
						try {
							const response = await fetch(location.href + 'send?' + message);
						}
						catch (e) {
							history.errors[CombUUID.encode()] = e.message + ' >> ' + e.stack;
						}
						await onclick_refresh();
					}
				</script>
			`);
		}
		else if (apiMethod === '/ping') {
			res.writeHead(200, { "Content-Type": "text/html" });
			const result = await ping(apiParameter || getAddressUrl(a));
			const text = result.message ? result.message : result;
			history.events[uuid.generate()] = text;
			res.end(text);
		}
		else if (apiMethod === '/history') {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify(history));
		}
		else if (apiMethod === '/send') {
			res.writeHead(200, { "Content-Type": "text/html" });
			const message = apiParameter;
			const result = await ping(`${getAddressUrl(a)}broadcast?${uuid.generate()}&${message}`);
			res.end(result);
		}
		else {
			res.writeHead(404, { 'Content-Type': 'text/html' });
			res.end(`page not found`);	
		}
	}).listen(port, ipv4, () => console.log(`run at ${getAddressDescription(b)}`));
}
run();

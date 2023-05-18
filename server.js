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
let broadcast_target_nodes; // mesh node: name -> ipv6 url
async function get_my_ipv(version, interface) {
	let process_get_ip = () => {
		return new Promise((resolve, reject) => {
			function handle_get_ip(error, stdout, stderr) {
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
			exec(`ifconfig ${interface} | grep "inet${version === 6 ? '6' : ''} " | awk '{print $2}'`, handle_get_ip);
		});
	};
	return await process_get_ip();
}
async function get_my_hostname() {
	let process_get_hostname = () => {
		return new Promise((resolve, reject) => {
			function handle_get_hostname(error, stdout, stderr) {
				if (error || stderr) {
					stderr && console.log(`stderr: ${stderr}`);
					error && console.log(`error: ${error.message}`);
					reject(stderr);
				} else {
					let result = stdout.split('\n')[0];
					console.log(`stdout: ${result}`);
					resolve(result);
				}
			}
			exec('hostname', handle_get_hostname);
		});
	};
	return await process_get_hostname();
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
function get_broadcast_target_nodes_table() {
	let result = '<div>mesh nodes</div>';
	for (let node in broadcast_target_nodes) {
		result += `<div>${node}: ${broadcast_target_nodes[node]}</div>`;
	}
	return result;
}
async function run() {
	async function wrap_curl(url) {
		let text = null;
		try {
			text = await curl(url);
		}
		catch (error) {
			text = error;
		}
		return text;
	}
	async function self_test() {
		const terminal_url = getAddressUrl(terminal_server);
		const mesh_url = getAddressUrl(mesh_server);
		return `<div>self test</div><div>${terminal_url}ping >> ${await wrap_curl(terminal_url + 'ping')}</div>
			<div>${mesh_url}ping >> ${await wrap_curl(mesh_url + 'ping')}</div>`;
	}
	
	if (!(process.platform in supported_platforms)) {
		process.exit(1);
	}
	const {name, stage, network_interface_terminal, network_interface_mesh} = supported_platforms[process.platform];
	console.log(`platform detected: ${process.platform} (${name}), stage ${stage}`);
	const ipv4 = LOCAL_RUN ? '127.0.0.1' : await get_my_ipv(4, network_interface_terminal);
	const ipv6 = LOCAL_RUN ? '::1' : await get_my_ipv(6, network_interface_mesh);
	broadcast_target_nodes = {
		'node1': `http://[${ipv6}]:5001/`,
		'node2': `http://[${ipv6}]:5002/`,
		'node3': `http://[${ipv6}]:5003/`,
		'node4': `http://[${ipv6}]:5004/`,
		'node5': `http://[${ipv6}]:5005/`,
	};
	let client = null;
	const mesh_server = http.createServer(async (req, res) => {
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
			const origin_hostname = parts[2];
			history.messages[id] = {origin_hostname, message};
			for (let node in broadcast_target_nodes)
				await wrap_curl(`${broadcast_target_nodes[node]}broadcast?${id}&${message}&${origin_hostname}`);
			client && client.write('data: refresh\n\n');
			res.end('sent');
		}
		else if (apiMethod === '/ping') {
			console.log(`incoming ipv6 ping - [${ipv6}]:${port}`);
			res.writeHead(200, { "Content-Type": "text/html" });
			res.end(`hello mesh IPv6! ${await get_my_hostname()}@${port}`);
		}
		else {
			res.writeHead(404, { 'Content-Type': 'text/html' });
			res.end(`unknown command`);	
		}
	}).listen(port, ipv6, () => console.log(`run at ${getAddressDescription(mesh_server)}`));
	const terminal_server = http.createServer(async (req, res) => {
		const urlParts = req.url.split('?');
		const apiMethod = urlParts[0];
		const apiParameter = urlParts[1];
		if (apiMethod === '/') {
			res.writeHead(200, { "Content-Type": "text/html" });
			res.end(`
				<h2>${await get_my_hostname()}</h2>
				<h3>terminal ipv4 = ${ipv4} mesh ipv6 = ${ipv6} port = ${port}</h3>
				<p>${await self_test()}</p>
				<p>${get_broadcast_target_nodes_table()}</p>
				<div>
					<input id="ipvx" value="::1"><input id="port" value="5555">
					<button onclick="onclick_ping();">ping</button>
				</div>
				<p><input id="message" onkeydown="if (event.key === 'Enter') onclick_send();"><button onclick="onclick_send();">send</button></p>
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
					function uuidToTime(uuid) {
						const t = CombUUID.decode(uuid).timestamp_js;
						return t.getFullYear() + '.' + (t.getMonth()+1).toString().padStart(2, '0') + '.' + t.getDate().toString().padStart(2, '0') + ' ' +
							t.getHours().toString().padStart(2, '0') + ':' + t.getMinutes().toString().padStart(2, '0') + ':' +
							t.getSeconds().toString().padStart(2, '0');
					}
					async function onclick_ping() {
						const ipvx = document.getElementById('ipvx').value;
						const port = document.getElementById('port').value;
						try {
							const ip = ipvx.indexOf(':') >= 0 ? '[' + ipvx + ']' : ipvx;
							const response = await fetch(location.href + 'ping?http://' + ip + ':' + port + '/');
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
							recordElement.textContent = uuidToTime(uuid) + ' >> ' + 
								(records[uuid].origin_hostname ? (records[uuid].origin_hostname + ' >> ' + records[uuid].message) : records[uuid]);
							recordElement.style.color = (uuid in errors) ? 'red'
								: (uuid in events) ? 'orange'
									: (uuid in messages) ? 'black'
										: 'gray';
							if (!listElement.firstElementChild)
								listElement.append(recordElement);
							else
								listElement.insertBefore(recordElement, listElement.firstElementChild);
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
						document.getElementById('message').value = '';
					}
					const eventSource = new EventSource(location.href + 'subscribe');
					eventSource.addEventListener("open", (e) => {
						console.log(e);
					});
					eventSource.addEventListener("error", (e) => {
						console.log(e);
					});
					eventSource.addEventListener("notice", (e) => {
						console.log(e);
					});
					eventSource.addEventListener("update", (e) => {
						console.log(e);
					});
					eventSource.addEventListener("message", (e) => {
						onclick_refresh();
						console.log(e);
					});
				</script>
			`);
		}
		else if (apiMethod === '/ping') {
			res.writeHead(200, { "Content-Type": "text/html" });
			const result = apiParameter ? await wrap_curl(`${apiParameter}ping`)
				: `hello terminal IPv4! ${await get_my_hostname()}@${port}`;
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
			const result = await wrap_curl(`${getAddressUrl(mesh_server)}broadcast?${uuid.generate()}&${message}&${await get_my_hostname()}`);
			res.end(result);
		}
		else if (apiMethod === '/subscribe') {
				const headers = { // send headers to keep connection alive
					'Content-Type': 'text/event-stream',
					'Connection': 'keep-alive',
					'Cache-Control': 'no-cache'
				};
				res.writeHead(200, headers);
				res.write('subscribed'); // send client a simple response
				client = res; // store `res` of client to let us send events at will
				req.on('close', () => { client = null; }); // listen for client 'close' requests
				client && client.write('data: refresh\n\n');
				client && client.write('data: refresh\n\n');
		}
		else if (apiMethod === '/callback') {
			client && client.write('data: callback\n\n');
			res.writeHead(200, { "Content-Type": "text/html" });
			res.end('done');
		}
		else {
			res.writeHead(404, { 'Content-Type': 'text/html' });
			res.end(`page not found`);
		}
	}).listen(port, ipv4, () => console.log(`run at ${getAddressDescription(terminal_server)}`));
}
run();

// Harmonic Tension and ACT calculation (Auditory Compositional Tension)
var JZZ = require('jzz');
require('jzz-synth-fluid')(JZZ);
const midiParser = require("midi-parser-js");
const fs = require("fs");
const express = require("express");
const app = express();
app.use(express.static("./serve"));
const server = app.listen(9080, () => {
	console.log("Server running on 127.0.0.1:9080");
});
const WebSocket = require("ws");
const wss = new WebSocket.Server({ server });
let reuse = "awe";
const file = `./${reuse}midi.mid`;
//const outFile = `../${reuse}mact.csv`;
//const outFile2 = `../${reuse}hact.csv`;
const lineEnding = "\r\n";

wss.on('connection', (ws, req) => {
	ws.on('message', (message) => {
		interpret(parseInt(message.toString()));
	});
});

let paused = true;

let nScale = 3;
let cScale = [(0 + nScale)%12, (2 + nScale)%12, (4 + nScale)%12, (5 + nScale)%12, (7 + nScale)%12, (9 + nScale)%12, (11 + nScale)%12];
let chromaticScale = [(1 + nScale)%12, (3 + nScale)%12, (6 + nScale)%12, (8 + nScale)%12, (10 + nScale) % 12];

let curTension = [0.0, 0.0];
let instabilities = [0, 0.55, 0, 0.8, 0, 0.5, 1.0];
let chromaInstabilities = [1.15, 1.1, 1.05, 1.0, 1.0];
let resolutions = [0, 0, 2, 2, 4, 4, 0, 0, 0, 0, 0, 0];

let cNotes = [];

let lastChord = [];
let curChord = [];

let lastMelodies = [];
let melodies = [];

let outPort = JZZ.synth.Fluid({ path: "bin/fluidsynth.exe", sf: "LSPModel CFX Yamaha [Pro] v1.8.sf2" });
//let outPort2 = JZZ.synth.Fluid({ path: "bin/fluidsynth.exe", sf: "LSPModel D274 Steinway III [Pro].sf2" });
function calculateInstability(notes) {
	let instability = 0.0;
	notes.forEach(n => {
		if (n >= cScale.length) {
			instability += chromaInstabilities[n - cScale.length];
		} else {
			instability += instabilities[n];
		}
	})
	return instability;
}

function melodyRemove(n) {
	let scaleDeg = note2sd(n);
	if (melodies.includes(scaleDeg)) melodies.splice(melodies.indexOf(scaleDeg), 1);
}

function melodyHit(n) {
	let scaleDeg = note2sd(n);
	if (!melodies.includes(scaleDeg)) melodies.push(scaleDeg);
}

let lastBatch = [];

function processLast(degsA, degsB, index) {
	/*if (index == 0) {
		console.log(degsA, degsB);
	}*/
	
	let resolutionAmount = 0;
	let unique = 0;
	for (v = 0; v < degsB.length; v++) {
		let deg = degsB[v];
		if (!degsA.includes(deg)) {
			if (degsA.includes(resolutions[deg])) {
				resolutionAmount++;
			}
			if (resolutions[deg] != deg) unique++;
			/*
			curTension[index] -= deg < 7 ? instabilities[deg] : chromaInstabilities[deg % 7];
			if (curTension[index] < 0) curTension[index] = 0;
			*/
		}
	}
	
	if (unique > 0) {
		curTension[index] -= curTension[index] * resolutionAmount / unique;
	}
	
	for (v = 0; v < degsA.length; v++) {
		let deg = degsA[v];
		if (!degsB.includes(deg)) {
			curTension[index] += deg < 7 ? instabilities[deg] : chromaInstabilities[deg % 7];
		}
	}
}

function processInstability(finale) {
	let chordInstability = calculateInstability(curChord);
	let queueMelo = [];
	melodies.forEach(n => {
		if (!curChord.includes(n)) queueMelo.push(n);
	})
	let meloInstability = calculateInstability(queueMelo);
	let sum = chordInstability + meloInstability;
	/*lastBatch.forEach(c => {
		outPort.send(0x80, c, 127);
	});*/
	/*if (queueMelo.length > 0) {
		lastBatch = [];
		let adder = 72;
	}*/
	//console.log("Harmonic Instability:", sum);
	//console.log(sum);
	processLast(melodies, lastMelodies, 0);
	processLast(curChord, lastChord, 1);
	
	//fs.appendFileSync(outFile, `${lastCt} ${curTension[0]}${finale ? "" : lineEnding}`);
	//fs.appendFileSync(outFile2, `${lastCt} ${curTension[1]}${finale ? "" : lineEnding}`);
	dataset2.push({ time: lastCt, act: [].concat(curTension), tht: 0.0 + sum, ht: [0.0 + meloInstability, 0.0 + chordInstability] });
	if (curChord.length > 0) lastChord = [].concat(curChord);
	if (melodies.length > 0) lastMelodies = [].concat(melodies);
}

function note2sd(no) {
	n = no % 12;
	let sd = cScale.indexOf(n);
	if (sd < 0) sd = chromaticScale.indexOf(n) + cScale.length;
	return sd;
}

function chordHit() {
	/*
	let scaleDegs = [];
	cNotes.forEach(note => {
		scaleDegs.push(cScale.indexOf(note % 12)+1);
	})
	let ch = -1;
	for (i = 0; i < chordIntervals.length; i++) {
		let c = chordIntervals[i];
		let isChord = true;
		for (j = 0; j < c.length; j++) {
			let d = c[j];
			if (!scaleDegs.includes(d)) {
				isChord = false;
				break;
			}
		}
		if (isChord) {
			ch = chordIntervals.indexOf(c);
			break;
		}
	}
	if (ch >= 0) {
		curChord = ch + 1;
	}
	*/
	curChord = [];
	cNotes.forEach(note => {
		curChord.push(note2sd(note));
	})
}

const NOTE_OFF = 8;
const NOTE_ON = 9;

let midiArray = midiParser.parse(fs.readFileSync(file, "base64"));
let dataset = [[], []];
let dataset2 = [];
let microSecs;

const ppq = midiArray.timeDivision;

midiArray.track.forEach((t, i) => {
	let e = t.event[0];
	if (e.metaType == 81) {
		microSecs = e.data;
		//bpm = 1 / (e.data / 60000000);
	} else if (typeof(e.data) == "string") {
		switch (e.data) {
			case "Melody":
				dataset[0] = t.event.filter(a => [NOTE_ON, NOTE_OFF].includes(a.type));
			case "Harmony":
				dataset[1] = t.event.filter(a => [NOTE_ON, NOTE_OFF].includes(a.type));
		}
	}
})

if (!microSecs) {
	console.log("NO MICROSECONDS?!");
	process.exit(0);
}

const M_ROLE = 0;
const H_ROLE = 1;

let procset = [];
let ct = 0;

dataset.forEach((dset, i) => {
	ct = 0;
	dset.forEach(e => {
		let eObj = {};
		ct += e.deltaTime;
		eObj.time = (ct / ppq) * (60 * (microSecs / 60000000));
		eObj.type = e.type;
		eObj.data = e.data;
		eObj.role = i;
		procset.push(eObj);
	})
})

let lastCTime = -1;
let lastCt = 0;

procset.sort((a, b) => a.time - b.time);

//fs.writeFileSync(outFile, "");
//fs.writeFileSync(outFile2, "");

const fps = 30.0;
let cSecs = 0;
const intrvl = 1.0/fps;
let p = 0;
let cData = { time: 0.0, act: [0.0, 0.0], tht: 0.0, ht: [0.0, 0.0] };
let xc = 0;
let next = false;

let started = false;

let doin = false;

function initiate() {
	paused = false;
	started = true;
	xc = 0;
	p = 0;
	createFrameInterval();
}

let multiplier = 1;
let dontUpdate = false;

function updataxc() {
	if (cSecs > procset[xc].time && !doin) {
		xc++;
		setImmediate(updataxc);
		return;
	}
	setImmediate(updataset2);
}

function updataset2() {
	if (cSecs > dataset2[p].time && !doin) {
		p++;
		setImmediate(updataset2);
		return;
	}
	releaseAll();
	dontUpdate = false;
}

function updateIndexes() {
	p = 0;
	xc = 0;
	//while (cSecs < procset[xc].time) xc++;
	//console.log(dataset2[p])
	//let e = dataset2[p];
	//updataset2();
	//while (cSecs < dataset2[p].time) p++;
	setImmediate(updataxc);
}

function interpret(kc) {
	switch (kc) {
		case 32:
			if (doin) return;
			if (!started) {
				cSecs = 0;
				initiate();
			} else {
				paused = !paused;
				if (paused) releaseAll();
			}
			break;
		case 37:
			doin = true;
			dontUpdate = true;
			//paused = true;
			cSecs -= (60 * (microSecs / 60000000))*multiplier;
			if (cSecs < 0.0) cSecs = 0.0;
			
			break;
		case 39:
			doin = true;
			dontUpdate = true;
			//paused = true;
			cSecs += (60 * (microSecs / 60000000))*multiplier;
			
			break;
		case 2037:
			doin = false;
			if (!started) {
				initiate();
			} else {
				updateIndexes();
			}
			/*if (!started) {
				initiate();
			} else {
				updateIndexes();
				paused = false;
			}*/
			break;
		case 2039:
			doin = false;
			/*if (!started) {
				initiate();
			} else {
				paused = false;
			}*/
			if (!started) {
				initiate();
			} else {
				updateIndexes();
			}
			break;
		case 8:
			p = 0;
			xc = 0;
			paused = false;
			cSecs = 0;
			if (!started) initiate();
			//initiate();
			break;
	}
}

function releaseAll() {
	for (n = 0; n < 128; n++) {
		outPort.send(0x80, n, 127);
	}
}

let frameInterval;

function onFrame() {
	if (paused) {
		//setTimeout(onFrame, intrvl*1000);
		return;
	}
	/*
	if (p >= procset.length - 1) return;
	let e = procset[p];
	if (cSecs >= e.time) {
		//setTimeout(() => { outPort2.send(e.type == NOTE_OFF ? 0x80 : 0x90, e.data[0], e.data[1]) }, 250);
		ct = e.time;
		//console.log("proc");
		if (p < procset.length - 1) {
			if (ct != lastCt) {
				if (cNotes.length > 0) {
					chordHit();
					cNotes = [];
				}
				//console.log("process timeframe");
				processInstability(false);
			}
		}
		//console.log(e);
		eventCall(e.type, e.data[0], e.role);
		lastCt = ct;
		if (p >= procset.length - 1) processInstability(true);
		p++;
		if (p < procset.length - 1) {
			if (cSecs >= procset[p].time) {
				setImmediate(onFrame);
				return;
			}
		}
	}
	cSecs += intrvl;
	setTimeout(() => {
		setImmediate(onFrame);
	}, intrvl*1000);
	*/
	if (!next || dontUpdate) {
		if (p < dataset2.length) {
			if (cSecs >= dataset2[p].time) {
				cData = Object.assign(cData, dataset2[p]);
				if (!dontUpdate) p++;
			}
			cData.time = 0.0 + cSecs;
			//console.log("A");
			wss.clients.forEach(function each(client) {
				if (client.readyState === WebSocket.OPEN) {
					client.send(JSON.stringify(cData), { binary: false });
				}
			});
		}
	}
	if (xc >= procset.length - 1) {
		started = false;
		releaseAll();
		return;
	}
	let e = procset[xc];
	if (cSecs >= e.time && !dontUpdate) {
		if (!doin) outPort.send(e.type == NOTE_OFF ? 0x80 : 0x90, e.data[0], Math.floor(e.data[1]));
		xc++;
		if (xc < procset.length - 1) {
			if (cSecs >= procset[xc].time) {
				next = true;
				//setImmediate(onFrame);
				return;
			}
		}
	}
	next = false;
	if (!dontUpdate) cSecs += intrvl;
}

function createFrameInterval() {
	if (!frameInterval) {
		frameInterval = setInterval(() => {
			process.nextTick(onFrame);
			//setTimeout(onFrame, intrvl*1000.0);
		}, intrvl * 1000);
	}
}

/*setTimeout(() => {
	setImmediate(onFrame);
}, 3000);*/

procset.forEach((e, p) => {
	ct = e.time;
	///console.log("proc");
	if (p < procset.length - 1) {
		if (ct != lastCt) {
			if (cNotes.length > 0) {
				chordHit();
				cNotes = [];
			}
			//console.log("process timeframe");
			processInstability(false);
		}
	}
	//console.log(e);
	eventCall(e.type, e.data[0], e.role);
	lastCt = ct;
	if (p >= procset.length - 1) processInstability(true);
})

//console.log(dataset2);

function eventCall(type, data, role) {
	switch (type) {
		case NOTE_ON:
			if (role == H_ROLE && (lastCTime == ct || lastCTime == -1)) {
				if (lastCTime == -1) lastCTime = ct;
				cNotes.push(data);
			}
			if (role == M_ROLE) {
				melodyHit(data);
				lastCTime = -1;
			}
			break;
		case NOTE_OFF:
			if (role == M_ROLE) {
				melodyRemove(data);
				lastRole = role;
			}
			break;
	}
}
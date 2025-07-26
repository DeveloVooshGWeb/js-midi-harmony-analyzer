// ACT calculation (Auditory Compositional Tension)
var JZZ = require('jzz');
require('jzz-synth-fluid')(JZZ);
const midiParser = require("midi-parser-js");
const fs = require("fs");
let reuse = "hoshit";
const file = `./${reuse}midi.mid`;
const outFile = `../${reuse}mact.csv`;
const outFile2 = `../${reuse}hact.csv`;
const lineEnding = "\r\n";

let nScale = 5;
let cScale = [(0 + nScale)%12, (2 + nScale)%12, (4 + nScale)%12, (5 + nScale)%12, (7 + nScale)%12, (9 + nScale)%12, (11 + nScale)%12];
let chromaticScale = [(1 + nScale)%12, (3 + nScale)%12, (6 + nScale)%12, (8 + nScale)%12, (10 + nScale) % 12];

/*
let instabilities = [0, 0.55, 0, 0.8, 0, 0.5, 1.0];
// initially 3 is 0.25 and 5 is 0.01
let chromaInstabilities = [1.15, 1.1, 1.05, 1.0, 1.0];
*/
let curTension = [0.0, 0.0];
let instabilities = [0, 0.55, 0, 0.8, 0, 0.5, 1.0];
let chromaInstabilities = [1.15, 1.1, 1.05, 1.0, 1.0];
let resolutions = [0, 0, 2, 2, 4, 4, 0, 0, 0, 0, 0, 0];
//let passTensions = [1.0];

let cNotes = [];

let lastChord = [];
let curChord = [];

let lastMelodies = [];
let melodies = [];

let outPort = JZZ.synth.Fluid({ path: "bin/fluidsynth.exe", sf: "LSPModel CFX Yamaha [Pro] v1.8.sf2" });
let outPort2 = JZZ.synth.Fluid({ path: "bin/fluidsynth.exe", sf: "LSPModel D274 Steinway III [Pro].sf2" });

/*
function calculateInstability(notes) {
	let instability = 0.0;
	notes.forEach(n => {
		//let l = n - 1;
		if (n >= cScale.length) {
			instability += chromaInstabilities[n - cScale.length];
		} else {
			instability += instabilities[n];
		}
	})
	return instability;
}
*/

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
	if (index == 0) {
		console.log(degsA, degsB);
	}
	
	let resolutionAmount = 0;
	let unique = 0;
	for (v = 0; v < degsB.length; v++) {
		let deg = degsB[v];
		if (!degsA.includes(deg)) {
			if (degsA.includes(resolutions[deg])) {
				resolutionAmount++;
			}
			unique++;
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
	//let chordInstability = calculateInstability(curChord);
	//let chordInstability = 0;
	/*let queueMelo = [];
	melodies.forEach(n => {
		//queueMelo.push(n);
		if (!curChord.includes(n)) queueMelo.push(n);
	})*/
	//let meloInstability = calculateInstability(queueMelo);
	/*let sum = chordInstability + meloInstability;
	lastBatch.forEach(c => {
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
	fs.appendFileSync(outFile, `${lastCt} ${curTension[0]}${finale ? "" : lineEnding}`);
	fs.appendFileSync(outFile2, `${lastCt} ${curTension[1]}${finale ? "" : lineEnding}`);
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

fs.writeFileSync(outFile, "");
fs.writeFileSync(outFile2, "");

/*
let cSecs = 0;
let intrvl = 1/60;
let p = 0;

function onFrame() {
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
}

setImmediate(onFrame);
*/

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
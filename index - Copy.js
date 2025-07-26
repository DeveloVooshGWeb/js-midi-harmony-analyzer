var JZZ = require('jzz');
require('jzz-synth-fluid')(JZZ);
const midiParser = require("midi-parser-js");
const fs = require("fs");
let reuse = "overload";
const file = `./${reuse}midi.mid`;
const outFile = `../${reuse}.csv`;
const lineEnding = "\r\n";

let nScale = 3;
let cScale = [(0 + nScale)%12, (2 + nScale)%12, (4 + nScale)%12, (5 + nScale)%12, (7 + nScale)%12, (9 + nScale)%12, (11 + nScale)%12];
let chromaticScale = [(1 + nScale)%12, (3 + nScale)%12, (6 + nScale)%12, (8 + nScale)%12, (10 + nScale) % 12];

//let chordIntervals = [[1, 3, 5], [2, 4, 6], [3, 5, 7], [4, 6, 1], [5, 7, 2], [6, 1, 3], [7, 2, 4]];
//let romans = ["I", "ii", "iii", "IV", "V", "vi", "vii^o"];
let instabilities = [0, 0.55, 0, 0.8, 0, 0.5, 1.0];
// initially 3 is 0.25 and 5 is 0.01
let chromaInstabilities = [1.15, 1.1, 1.05, 1.0, 1.0];

let cNotes = [];
let curChord = [];

let melodies = [];

let outPort = JZZ.synth.Fluid({ path: "bin/fluidsynth.exe", sf: "LSPModel CFX Yamaha [Pro] v1.8.sf2" });
let outPort2 = JZZ.synth.Fluid({ path: "bin/fluidsynth.exe", sf: "LSPModel D274 Steinway III [Pro].sf2" });

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

function melodyRemove(n) {
	let scaleDeg = note2sd(n); //cScale.indexOf(n % 12) + 1;
	if (melodies.includes(scaleDeg)) melodies.splice(melodies.indexOf(scaleDeg), 1);
	//processInstability();
}

function melodyHit(n) {
	let scaleDeg = note2sd(n); //cScale.indexOf(n % 12) + 1;
	if (!melodies.includes(scaleDeg)) melodies.push(scaleDeg);
	//processInstability();
}

let lastBatch = [];

function processInstability(finale) {
	//let chordList = chordIntervals[curChord - 1];
	//let chordInstability = calculateInstability(curChord);
	let chordInstability = 0;
	let queueMelo = [];
	melodies.forEach(n => {
		queueMelo.push(n);
		//if (!curChord.includes(n)) queueMelo.push(n);
	})
	let meloInstability = calculateInstability(queueMelo);
	let sum = chordInstability + meloInstability;
	lastBatch.forEach(c => {
		outPort.send(0x80, c, 127);
	});
	if (queueMelo.length > 0) {
		lastBatch = [];
		let adder = 72;
		/*
		curChord.forEach(c => {
			let z = (c < 7 ? cScale[c] : chromaticScale[c - 7]) + adder;
			outPort.send(0x90, z, 96);
			lastBatch.push(z);
		});
		queueMelo.forEach(c => {
			let z = (c < 7 ? cScale[c] : chromaticScale[c - 7]) + adder;
			outPort.send(0x90, z, 96);
			lastBatch.push(z);
		});
		*/
	}
	console.log("Harmonic Instability:", sum);
	//console.log(sum);
	/*
	label.text = defText + str(sum);
	let tween:Tween = get_tree().create_tween();
	tween.tween_property(bar, "size", Vector2(256.0 * sum + 64.0, 96.0), 0.25).set_ease(Tween.EASE_IN_OUT);
	bar.color = Color(sum if sum < 1 else 1, sum if sum < 0.5 else 0.5 if sum >= 0.5 && sum < 1 else 0.5 - (sum - 1) * 0.5 if sum >= 1 else 0, 1 - sum if sum < 1 else 0);
	let time = asp.get_playback_position() + AudioServer.get_time_since_last_mix()
	time -= AudioServer.get_output_latency()
	outFile.store_line(str(time) + " " + str(sum));
	*/
	fs.appendFileSync(outFile, `${lastCt} ${sum}${finale ? "" : lineEnding}`);
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
//let lastRole;
let lastCt = 0;

procset.sort((a, b) => a.time - b.time);

fs.writeFileSync(outFile, "");

let cSecs = 0;
let intrvl = 1/60;
let p = 0;

//let timer = setInterval(() => {
	
function onFrame() {
	if (p >= procset.length - 1) return;
	let e = procset[p];
	if (cSecs >= e.time) {
		setTimeout(() => { outPort2.send(e.type == NOTE_OFF ? 0x80 : 0x90, e.data[0], e.data[1]) }, 250);
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

//}, intrvl / 1000)

/*
procset.forEach((e, p) => {
	ct = e.time;
	///console.log("proc");
	if (p < procset.length - 1) {
		if (ct != lastCt) {
			if (cNotes.length > 0) {
				chordHit();
				cNotes = [];
			}
			console.log("process timeframe");
			processInstability(false);
		}
	}
	console.log(e);
	eventCall(e.type, e.data[0], e.role);
	lastCt = ct;
	if (p >= procset.length - 1) processInstability(true);
})
*/

/*
let sizes = dataset[0].length;
if (sizes < dataset[1].length) sizes = dataset[1].length;

for (k = 0; k < sizes; k++) {
	let lens = [dataset[0].length, dataset[1].length];
	let a;
	let b;
	if (timers[1] == timers[0]) {
		
	} else {
		
	}
}
*/

function eventCall(type, data, role) {
	switch (type) {
		case NOTE_ON:
			if (role == H_ROLE && (lastCTime == ct || lastCTime == -1)) {
				//console.log(ct, lastCTime);
				if (lastCTime == -1) lastCTime = ct;
				cNotes.push(data);
				//lastCTime = ct;
				//lastRole = role;
			}/* else if (cNotes.length > 0) {
				//console.log("chord hit ", ct);
				//console.log(1 / (microSecs / 60000000));
				chordHit();
				cNotes = [];
			}*/
			if (role == M_ROLE) {
				melodyHit(data);
				lastCTime = -1;
				//lastRole = role;
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

// console.log(midiArray.track[1].event);
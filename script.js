//
// Zoom MS-50G / 60B / 70CDR
//
// MIDI commands
//  These commands are inferred by irresponsible experiment and not garanteed.
//
//  ProgramChange : [0xc0,pp]
//     Select patch by MIDI Program Change pp=patch number (0-49)
//  IdentityRequest : [0xf0,0x7e,0x00,0x06,0x01,0xf7]
//     Identity Request (MIDI Universal System Exclusive). It return [0xf0,0x7e,0x00,0x06,0x02,0x52,0x58,0x00,0x00,0x00,0x33,0x2e,0x30,0x30,0xf7]
//  TunerMode : [0xb0,0x4a,mm]
//     Tuner Mode On/Off. MIDI Control Change CC#74. mm<64:off mm>=64:on
//  WritePatch :          [0xf0,0x52,0x00,0x58,0x28,effect1,effect2,...effect6,patch-name,0xf7] (146bytes)
//     Write 146bytes patch-data to current program.
//     It consist of [0xf8,0x52,0x00,0x58,0x28, effect1,effect2,...effect6, patch-name,0xf7]
//  RequestPatch :        [0xf0,0x52,0x00,0x58,0x29,0xf7]
//     Requst patch-data of current program. it returns 146 bytes patch-data (same as WritePatch command)
//  EffectEnable :        [0xf0,0x52,0x00,0x58,0x31,nn,0x00,mm,0x00,0xf7]
//     Effect On/Off. It seems effective only for effect1-3.  nn=effect#(0-2) mm=0:off mm=1:on
//  ParameterEdit :       [0xf0,0x52,0x00,0x58,0x31,nn,pp,vvLSB,vvMSB,0xf7]
//     Parameter value edit. nn=effect# pp=param#+2 vv=value. value range is depends on each effect.
//  Patch Store :      [0xf0,0x52,0x00,0x58,0x32,0x01,0x00,0x00,pp,0x00,0x00,0x00,0x00,0x00,0xf7]
//     Message (Storing...)
//  RequestCurrentProgram : [0xf0,0x52,0x00,0x58,0x33,0xf7]
//     Request current bank&program. It returns [0xb0,0x00,0x00, 0xb0,0x20,0x00, 0xc0,pp] pp=program#(0-49) bank is always 0
//  ParameterEditEnable : [0xf0,0x52,0x00,0x58,0x50,0xf7]
//     Parameter value edit enable. Needed before Parameter Edit.
//  ParameterEditDisable :[0xf0,0x52,0x00,0x58,0x51,0xf7]
//     Parameter value edit disable.
//  ??? :                 [0xf0,0x52,0x00,0x58,0x60,0xf7]
//

var midiif=null;
var midioutputs=[];
var midiin=null;
var midirecv="";
var patches=[];
var clipboard=new apatch();
var inst=null;
var currentpatch=-1;
var currenteffect=0;
var currentparam=0;
var timer,timerprg;
var dragtarget=null;
var ready=false;
var instanceid=null;
var abort=false;
var url;
var autosave=0;

var patchkeymap=[
  "a","b","c","d","e","f","g","h","i","j","k","l","m","n","o","p","q","r","s","t",
  "A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T",
  "1","2","3","4","5","6","7","8","9","0"];
var effectkeymap=["F1","F2","F3","F4","F5","F6"];
var tunerkey="F9";
var dirty=0;

var emptypatch=[
  0xf0,0x52,0x00,0x58,0x28,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
  0x00,0x00,0x00,0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
  0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
  0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
  0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
  0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
  0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x40,0x05,0x0f,0x45,0x00,0x6d,0x70,0x74,0x79,0x20,0x20,
  0x20,0x00,0x20,0x20,0x00,0xf7
];

var bampcab=[
  { //ver 1.00
    max:[16,32,48,96,112,192,0],
    disp:["AG 8x10","BM 4x12","HA 4x10","AC 1x18","AL 4x10","MB 1x12","OFF"],
  },
  { //ver 2.00
    max:[16,32,48,96,112,192,64,80,128,144,160,176,0],
    disp:["AG 8x10","BM 4x12","HA 4x10","AC 1x18","AL 4x10","MB 1x12","SWR 4x10","AG 1x15","PT 1x15","SB 4x12","GK 4x10","E 4x10","OFF"],
  },
];
var gampcab=[
  { //ver 1.00
    max:[8,16,48,80,144,240,304,320,0],
    disp:["FD COMBO 2x12","DLX-R 1x12","US BLUES 4x10","VX JMI 2x12","TW ROCK 1x12","MS 1959 4x12","DZ DRIVE 4x12","ALIEN 4x12","OFF"],
  },
  { //ver 3.00
    max:[8,16,32,48,64,80,96,112,128,144,160,176,192,208,224,240,256,272,288,304,320,336,0],
    disp:["FD COMBO 2x12","DLX-R 1x12","FD VIBRO 2x10","US BLUES 4x10","VX COMBO 2x12","VX JMI 2x12","BG CRUNCH 1x12","MATCH 30 2x12","CAR DRIVE 1x12","TW ROCK 1x12","TONE CITY 4x12","HW STACK 4x12","TANGERINE 4x12","B-BRKR 2x12","MS CRUNCH 4x12","MS 1959 4x12","MS DRIVE 4x12","BGN DRIVE 4x12","BG DRIVE 4x12","DZ DRIVE 4x12","ALIEN 4x12","REVO-1 4x12","OFF"],
  }
];
var bampcabmax=[];
var bampcabdisp=[];
var gampcabmax=[];
var gampcabdisp=[];

var effectlist={
  0x00000000:{name:"THRU",group:"THRU",order:1,install:1,ver:0x0101,
    dsp:10000,dspmax:0,dspmin:0,
    param:[]
  },
  0x00300002:{name:"D Comp",group:"COMP",order:2000,install:0,ver:0x0010,title:"MXR Dyna Comp style comp",
    dsp:9.7325,dspmax:1/10,dspmin:1/40,
    param:[
    {name:"Sense",def:3,max:10},
    {name:"Tone",def:8,max:10},
    {name:"Level",def:125,max:150},
    {name:"ATTCK",def:1,max:1,disp:["Slow","Fast"]},
  ]},
  0x200018:{name:"Ba Boost",group:"DRIVE",order:2001,install:0,ver:0x0010,title:"Xotic EP Booster simulation",
    dsp:5.8859,dspmax:59/300,dspmin:16/100,
    param:[
    {name:"Gain",def:35,max:100},
    {name:"Bass",def:10,max:20,disp:-10},
    {name:"Trebl",def:8,max:20,disp:-10},
    {name:"Level",def:78,max:150},
  ]},
  0x400018:{name:"Bass OD",group:"DRIVE",order:2002,install:0,ver:0x0010,title:"BOSS ODB-3 simulation",
    dsp:6.0283,dspmax:59/300,dspmin:16/100,
    param:[
    {name:"Gain",def:0,max:100},
    {name:"Tone",def:20,max:100},
    {name:"Level",def:120,max:150},
    {anme:"Bal",def:50,max:100},
  ]},
  0x600018:{name:"Bass Muff",group:"DRIVE",order:2003,install:0,ver:0x0010,title:"Electro-Harmonix Bass Big Muff simulation",
    dsp:6.0283,dspmax:59/300,dspmin:16/100,
    param:[
    {name:"Gain",def:88,max:100},
    {name:"Tone",def:95,max:100},
    {name:"Level",def:100,max:150},
    {name:"Mode",def:1,max:1,disp:["NORM","BsBST"]},
    {name:"Bal",def:100,max:100},
  ]},
  0x40200018:{name:"Ba Dist 1",group:"DRIVE",order:2004,install:0,ver:0x0010,title:"BOSS DS-1 emulation with added paremeter",
    dsp:6.4430,dspmax:59/300,dspmin:16/100,
    param:[
    {name:"Gain",def:42,max:100},
    {name:"Tone",def:50,max:100},
    {name:"Level",def:100,max:150},
    {name:"Bal",def:50,max:100},
  ]},
  0x00200118:{name:"Ba Metal",group:"DRIVE",order:2005,install:0,ver:0x0010,title:"BOSS Metal Zone emulation with added parameter",
    dsp:6.3343,dspmax:59/300,dspmin:16/100,
    param:[
    {name:"Gain",def:67,max:100},
    {name:"Tone",def:85,max:100},
    {name:"Level",def:60,max:150},
    {name:"Bal",def:100,max:100},
  ]},
  0x00400118:{name:"TS+DRY",group:"DRIVE",order:2006,install:0,ver:0x0020,title:"Ibanez TS808 emulation with added parameter",
    dsp:6.0283,dspmax:59/300,dspmin:16/100,
    param:[
    {name:"Gain",def:35,max:100},
    {name:"Tone",def:74,max:100},
    {name:"Level",def:110,max:150},
    {name:"Bal",def:50,max:100},
  ]},
  0x00600118:{name:"Ba Squeak",group:"DRIVE",order:2007,install:0,ver:0x0020,title:"ProCo RAT emulation with added parameter",
    dsp:5.9782,dspmax:59/300,dspmin:16/100,
    param:[
    {name:"Gain",def:46,max:100},
    {name:"Tone",def:50,max:100},
    {name:"Level",def:100,max:150},
    {name:"Bal",def:50,max:100},
  ]},
  0x40000118:{name:"BaFzSmile",group:"DRIVE",order:2008,install:0,ver:0x0020,title:"FUZZ FACE emulation with added parameter",
    dsp:6.0283,dspmax:59/300,dspmin:16/100,
    param:[
    {name:"Gain",def:43,max:100},
    {name:"Tone",def:70,max:100},
    {name:"Level",def:100,max:150},
    {name:"Bal",def:100,max:100},
  ]},
  0x0020001a:{name:"BassDrive",group:"DRIVE",order:2009,install:0,ver:0x0010,title:"SansAmp BASS DRIVER DI simulation",
    dsp:4.8000,dspmax:68/300,dspmin:16/100,
    param:[
    {name:"Bass",def:11,max:20,disp:-10},
    {name:"Trebl",def:11,max:20,disp:-10},
    {name:"Prese",def:13,max:20,disp:-10},
    {name:"Gain",def:93,max:100},
    {name:"Blend",def:100,max:100},
    {name:"Level",def:40,max:150},
    {name:"Mid",def:17,max:20,disp:-10},
  ]},
  0x0040001a:{name:"D.I Plus",group:"DRIVE",order:2010,install:0,ver:0x0010,title:"MXR Bass D.I.+ simulation",
    dsp:5.1429,dspmax:68/300,dspmin:16/100,//0.2266 - 0.16
    param:[
    {name:"Bass",def:13,max:20,disp:-10},
    {name:"Mid",def:12,max:20,disp:-10},
    {name:"Trebl",def:12,max:20,disp:-10},
    {name:"Gain",def:80,max:100},
    {name:"Blend",def:100,max:100},
    {name:"Level",def:120,max:150},
    {name:"Color",def:0,max:1,disp:["OFF","ON"]},
    {name:"CHAN",def:1,max:1,disp:["CLN","DIST"]},
  ]},
  0x0060001a:{name:"Bass BB",group:"DRIVE",order:2011,install:0,ver:0x0010,title:"Xotic Bass BB Preamp simulation",
    dsp:6.3099,dspmax:59/300,dspmin:16/100,
    param:[
    {name:"Gain",def:84,max:100},
    {name:"Bass",def:13,max:20,disp:-10},
    {name:"Trebl",def:16,max:20,disp:-10},
    {name:"Blend",def:100,max:100},
    {name:"Level",def:70,max:150},
  ]},
  0x4000001a:{name:"DI5",group:"DRIVE",order:2012,install:0,ver:0x0010,title:"AVALON DESIGN U5 preamp simulation",
    dsp:4.9091,dspmax:68/300,dspmin:16/100,
    param:[
    {name:"Gain",def:60,max:100},
    {name:"Tone",def:0,max:6,disp:["OFF","1","2","3","4","5","6"]},
    {name:"Level",def:100,max:150},
    {name:"HiCut",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x4020001a:{name:"Bass Pre",group:"DRIVE",order:2013,install:0,ver:0x0010,title:"Preamp with semi-parametric EQ",
    dsp:4.9091,dspmax:68/300,dspmin:16/100,
    param:[
    {name:"Bass",def:3,max:10},
    {name:"Treble",def:3,max:10},
    {name:"Level",def:80,max:150},
    {name:"Mid",def:14,max:20,disp:-10},
    {name:"Freq",def:7,max:23,disp:["100Hz","120Hz","140Hz","150Hz","160Hz","180Hz","200Hz","250Hz","300Hz","350Hz","400Hz","450Hz","500Hz","630Hz","800Hz","1.0kHz","1.2kHz","1.6kHz","2.0kHz","2.5kHz","3.0kHz","3.6kHz","4.0kHz","4.5kHz",]},
  ]},
  0x4040001a:{name:"AC Bs Pre",group:"DRIVE",order:2014,install:0,ver:0x0010,title:"Preamp with graphic EQ",
    dsp:4.9091,dspmax:68/300,dspmin:16/100,
    param:[
    {name:"Gain",def:60,max:100},
    {name:"Depth",def:10,max:10},
    {name:"Level",def:100,max:150},
    {name:"Bass",def:10,max:20,disp:-10},
    {name:"L-Mid",def:8,max:20,disp:-10},
    {name:"LM_F",def:20,max:30,disp:["32Hz","40Hz","50Hz","63Hz","70Hz","80Hz","100Hz","120Hz","140Hz","150Hz","160Hz","180Hz","200Hz","250Hz","300Hz","350Hz","400Hz","450Hz","500Hz","630Hz","800Hz","1.0kHz","1.2kHz","1.6kHz","2.0kHz","2.5kHz","3.0kHz","3.6kHz","4.0kHz","4.5kHz","6.3kHz",]},
    {name:"Mid",def:7,max:20,disp:-10},
    {name:"H-Mid",def:13,max:20,disp:-10},
    {name:"Trebl",def:12,max:20,disp:-10},
  ]},
  0x0020000a:{name:"SVT",group:"AMP",order:2100,install:0,ver:0x0010,title:"Ampeg SVT simulation",
    dsp:3.7895,dspmax:5/18,dspmin:201/750,//0.2777 - 0.268
    param:[
    {name:"Bass",def:12,max:20,disp:-10},
    {name:"Mid",def:14,max:20,disp:-10},
    {name:"Trebl",def:12,max:20,disp:-10},
    {name:"Mid_F",def:15,max:30,disp:["32Hz","40Hz","50Hz","63Hz","70Hz","80Hz","100Hz","120Hz","140Hz","150Hz","160Hz","180Hz","200Hz","250Hz",
      "300Hz","350Hz","400Hz","450Hz","500Hz","630Hz","800Hz","1.0kHz","1.2kHz","1.6kHz","2.0kHz","2.5kHz","3.0kHz","3.6kHz","4.0kHz","4.5kHz","6.3kHz",]},
    {name:"Gain",def:40,max:100},
    {name:"Level",def:38,max:150},
    {name:"Ultra",def:0,max:4,disp:["OFF","Low","Hi","Both","Cut"]},
    {name:"CAB",def:16,max:bampcabmax,disp:bampcabdisp},
    {name:"Mix",def:50,max:100},
  ]},
  0x0040000a:{name:"B-Man",group:"AMP",order:2101,install:0,ver:0x0010,title:"Fender BASSMAN 100 simulation",
    dsp:3.7895,dspmax:5/18,dspmin:201/750,//0.2777 - 0.268
    param:[
    {name:"Bass",def:15,max:20,disp:-10},
    {name:"Mid",def:16,max:20,disp:-10},
    {name:"Trebl",def:10,max:20,disp:-10},
    {name:"Mid_F",def:12,max:30,disp:["32Hz","40Hz","50Hz","63Hz","70Hz","80Hz","100Hz","120Hz","140Hz","150Hz","160Hz","180Hz","200Hz","250Hz",
      "300Hz","350Hz","400Hz","450Hz","500Hz","630Hz","800Hz","1.0kHz","1.2kHz","1.6kHz","2.0kHz","2.5kHz","3.0kHz","3.6kHz","4.0kHz","4.5kHz","6.3kHz",]},
    {name:"Gain",def:40,max:100},
    {name:"Level",def:60,max:150},
    {name:"Deep",def:0,max:1,disp:["OFF","ON"]},
    {name:"CAB",def:32,max:bampcabmax,disp:bampcabdisp},
    {name:"Mix",def:50,max:100},
  ]},
  0x0060000a:{name:"HRT3500",group:"AMP",order:2102,install:0,ver:0x0010,title:" Hartke HA3500 simulation",
    dsp:3.7895,dspmax:5/18,dspmin:201/750,//0.2777 - 0.268
    param:[
    {name:"Bass",def:12,max:20,disp:-10},
    {name:"Mid",def:14,max:20,disp:-10},
    {name:"Trebl",def:11,max:20,disp:-10},
    {name:"Mid_F",def:12,max:30,disp:["32Hz","40Hz","50Hz","63Hz","70Hz","80Hz","100Hz","120Hz","140Hz","150Hz","160Hz","180Hz","200Hz","250Hz",
      "300Hz","350Hz","400Hz","450Hz","500Hz","630Hz","800Hz","1.0kHz","1.2kHz","1.6kHz","2.0kHz","2.5kHz","3.0kHz","3.6kHz","4.0kHz","4.5kHz","6.3kHz",]},
    {name:"Tube",def:50,max:100},
    {name:"Level",def:50,max:150},
    {name:"Comp",def:0,max:10,disp:["OFF","1","2","3","4","5","6","7","8","9","10"]},
    {name:"CAB",def:48,max:bampcabmax,disp:bampcabdisp},
    {name:"Mix",def:50,max:100},
  ]},
  0x4040000a:{name:"acoustic",group:"AMP",order:2103,install:0,ver:0x0010,title:"acoustic 360 simulation",
    dsp:3.7895,dspmax:5/18,dspmin:201/750,//0.2777 - 0.268
    param:[
    {name:"Bass",def:15,max:20,disp:-10},
    {name:"Mid",def:15,max:20,disp:-10},
    {name:"Trebl",def:17,max:20,disp:-10},
    {name:"Mid_F",def:19,max:30,disp:["32Hz","40Hz","50Hz","63Hz","70Hz","80Hz","100Hz","120Hz","140Hz","150Hz","160Hz","180Hz","200Hz","250Hz",
      "300Hz","350Hz","400Hz","450Hz","500Hz","630Hz","800Hz","1.0kHz","1.2kHz","1.6kHz","2.0kHz","2.5kHz","3.0kHz","3.6kHz","4.0kHz","4.5kHz","6.3kHz",]},
    {name:"Gain",def:40,max:100},
    {name:"Level",def:85,max:150},
    {name:"Bright",def:0,max:1,disp:["OFF","ON"]},
    {name:"CAB",def:96,max:bampcabmax,disp:bampcabdisp},
    {name:"Mix",def:50,max:100},
  ]},
  0x4060000a:{name:"Ag Amp",group:"AMP",order:2104,install:0,ver:0x0010,title:"Aguilar DB750 simulation",
    dsp:3.7895,dspmax:5/18,dspmin:201/750,//0.2777 - 0.268
    param:[
    {name:"Bass",def:13,max:20,disp:-10},
    {name:"Mid",def:14,max:20,disp:-10},
    {name:"Trebl",def:17,max:20,disp:-10},
    {name:"Mid_F",def:13,max:30,disp:["32Hz","40Hz","50Hz","63Hz","70Hz","80Hz","100Hz","120Hz","140Hz","150Hz","160Hz","180Hz","200Hz","250Hz",
      "300Hz","350Hz","400Hz","450Hz","500Hz","630Hz","800Hz","1.0kHz","1.2kHz","1.6kHz","2.0kHz","2.5kHz","3.0kHz","3.6kHz","4.0kHz","4.5kHz","6.3kHz",]},
    {name:"Gain",def:40,max:100},
    {name:"Level",def:75,max:150},
    {name:"Char",def:0,max:3,disp:["OFF","Deep","Brght","Both"]},
    {name:"CAB",def:112,max:bampcabmax,disp:bampcabdisp},
    {name:"Mix",def:50,max:100},
  ]},
  0x4000010a:{name:"Mark B",group:"AMP",order:2105,install:0,ver:0x0010,title:"Markbass Little Mark III simulation",
    dsp:3.7895,dspmax:5/18,dspmin:201/750,//0.2777 - 0.268
    param:[
    {name:"Bass",def:16,max:20,disp:-10},
    {name:"Mid",def:13,max:20,disp:-10},
    {name:"Trebl",def:13,max:20,disp:-10},
    {name:"Mid_F",def:12,max:30,disp:["32Hz","40Hz","50Hz","63Hz","70Hz","80Hz","100Hz","120Hz","140Hz","150Hz","160Hz","180Hz","200Hz","250Hz",
      "300Hz","350Hz","400Hz","450Hz","500Hz","630Hz","800Hz","1.0kHz","1.2kHz","1.6kHz","2.0kHz","2.5kHz","3.0kHz","3.6kHz","4.0kHz","4.5kHz","6.3kHz",]},
    {name:"Gain",def:50,max:100},
    {name:"Level",def:80,max:150},
    {name:"Color",def:0,max:6},
    {name:"CAB",def:192,max:bampcabmax,disp:bampcabdisp},
    {name:"Mix",def:50,max:100},
  ]},
  0x4000000a:{name:"SMR",group:"AMP",order:2106,install:0,ver:0x0020,title:"SWR SM-900 simulation",
    dsp:3.4923,dspmax:5/18,dspmin:746/2700,
    param:[
    {name:"Bass",def:13,max:20,disp:-10},
    {name:"Mid",def:17,max:20,disp:-10},
    {name:"Trebl",def:9,max:20,disp:-10},
    {name:"Mid_F",def:13,max:30,disp:["32Hz","40Hz","50Hz","63Hz","70Hz","80Hz","100Hz","120Hz","140Hz","150Hz","160Hz","180Hz","200Hz","250Hz",
      "300Hz","350Hz","400Hz","450Hz","500Hz","630Hz","800Hz","1.0kHz","1.2kHz","1.6kHz","2.0kHz","2.5kHz","3.0kHz","3.6kHz","4.0kHz","4.5kHz","6.3kHz",]},
    {name:"Gain",def:40,max:100},
    {name:"Level",def:60,max:150},
    {name:"ENHNC",def:1,max:10},
    {name:"CAB",def:64,max:bampcabmax,disp:bampcabdisp},
    {name:"Mix",def:50,max:100},
  ]},
  0x4020000a:{name:"Flip Top",group:"AMP",order:2107,install:0,ver:0x0020,title:"Ampeg B-15 simulation",
    dsp:3.4923,dspmax:84/300,dspmin:746/2700,//0.28 - 0.27629629
    param:[
    {name:"Bass",def:12,max:20,disp:-10},
    {name:"Mid",def:18,max:20,disp:-10},
    {name:"Trebl",def:5,max:20,disp:-10},
    {name:"Mid_F",def:12,max:30,disp:["32Hz","40Hz","50Hz","63Hz","70Hz","80Hz","100Hz","120Hz","140Hz","150Hz","160Hz","180Hz","200Hz","250Hz",
      "300Hz","350Hz","400Hz","450Hz","500Hz","630Hz","800Hz","1.0kHz","1.2kHz","1.6kHz","2.0kHz","2.5kHz","3.0kHz","3.6kHz","4.0kHz","4.5kHz","6.3kHz",]},
    {name:"Gain",def:40,max:100},
    {name:"Level",def:90,max:150},
    {name:"Ultra",def:0,max:3,disp:["Off","Low","Hi","Both"]},
    {name:"CAB",def:80,max:bampcabmax,disp:bampcabdisp},
    {name:"Mix",def:50,max:100},
  ]},
  0x0000010a:{name:"Monotone",group:"AMP",order:2108,install:0,ver:0x0020,title:"POLYTONE MINI-BRUTE III simulation",
    dsp:3.4923,dspmax:84/300,dspmin:746/2700,
    param:[
    {name:"Bass",def:13,max:20,disp:-10},
    {name:"Mid",def:18,max:20,disp:-10},
    {name:"Trebl",def:13,max:20,disp:-10},
    {name:"Mid_F",def:13,max:30,disp:["32Hz","40Hz","50Hz","63Hz","70Hz","80Hz","100Hz","120Hz","140Hz","150Hz","160Hz","180Hz","200Hz","250Hz",
      "300Hz","350Hz","400Hz","450Hz","500Hz","630Hz","800Hz","1.0kHz","1.2kHz","1.6kHz","2.0kHz","2.5kHz","3.0kHz","3.6kHz","4.0kHz","4.5kHz","6.3kHz",]},
    {name:"Gain",def:40,max:100},
    {name:"Level",def:70,max:150},
    {name:"Char",def:2,max:2,disp:["Dark","Brght","Flat"]},
    {name:"CAB",def:128,max:bampcabmax,disp:bampcabdisp},
    {name:"Mix",def:50,max:100},
  ]},
  0x0020010a:{name:"SuperB",group:"AMP",order:2109,install:0,ver:0x0020,title:"Marshall Super Bass I simulation",
    dsp:3.3479,dspmax:1/3,dspmin:82/300,
    param:[
    {name:"Bass",def:15,max:20,disp:-10},
    {name:"Mid",def:17,max:20,disp:-10},
    {name:"Trebl",def:17,max:20,disp:-10},
    {name:"Mid_F",def:13,max:30,disp:["32Hz","40Hz","50Hz","63Hz","70Hz","80Hz","100Hz","120Hz","140Hz","150Hz","160Hz","180Hz","200Hz","250Hz",
      "300Hz","350Hz","400Hz","450Hz","500Hz","630Hz","800Hz","1.0kHz","1.2kHz","1.6kHz","2.0kHz","2.5kHz","3.0kHz","3.6kHz","4.0kHz","4.5kHz","6.3kHz",]},
    {name:"Gain",def:55,max:100},
    {name:"Level",def:40,max:150},
    {name:"Prese",def:8,max:10},
    {name:"CAB",def:144,max:bampcabmax,disp:bampcabdisp},
    {name:"Mix",def:50,max:100},
  ]},
  0x0040010a:{name:"G-Krueger",group:"AMP",order:2110,install:0,ver:0x0020,title:"Gallien-Krueger 800RB simulation",
    dsp:3.4923,dspmax:84/300,dspmin:746/2700,//0.28 - 0.27629629
    param:[
    {name:"Bass",def:18,max:20,disp:-10},
    {name:"Mid",def:14,max:20,disp:-10},
    {name:"Trebl",def:12,max:20,disp:-10},
    {name:"Mid_F",def:12,max:30,disp:["32Hz","40Hz","50Hz","63Hz","70Hz","80Hz","100Hz","120Hz","140Hz","150Hz","160Hz","180Hz","200Hz","250Hz",
      "300Hz","350Hz","400Hz","450Hz","500Hz","630Hz","800Hz","1.0kHz","1.2kHz","1.6kHz","2.0kHz","2.5kHz","3.0kHz","3.6kHz","4.0kHz","4.5kHz","6.3kHz",]},
    {name:"Gain",def:40,max:100},
    {name:"Level",def:80,max:150},
    {name:"Color",def:0,max:3,disp:["Off","Low","Mid","Hi"]},
    {name:"CAB",def:160,max:bampcabmax,disp:bampcabdisp},
    {name:"Mix",def:50,max:100},
  ]},
  0x0060010a:{name:"Heaven",group:"AMP",order:2111,install:0,ver:0x0020,title:"Eden WT-800 simulation",
    dsp:3.4923,dspmax:84/300,dspmin:746/2700,//0.28 - 0.27629629
    param:[
    {name:"Bass",def:15,max:20,disp:-10},
    {name:"Mid",def:13,max:20,disp:-10},
    {name:"Trebl",def:14,max:20,disp:-10},
    {name:"Mid_F",def:12,max:30,disp:["32Hz","40Hz","50Hz","63Hz","70Hz","80Hz","100Hz","120Hz","140Hz","150Hz","160Hz","180Hz","200Hz","250Hz",
      "300Hz","350Hz","400Hz","450Hz","500Hz","630Hz","800Hz","1.0kHz","1.2kHz","1.6kHz","2.0kHz","2.5kHz","3.0kHz","3.6kHz","4.0kHz","4.5kHz","6.3kHz",]},
    {name:"Gain",def:50,max:100},
    {name:"Level",def:80,max:150},
    {name:"ENHNC",def:1,max:10},
    {name:"CAB",def:176,max:bampcabmax,disp:bampcabdisp},
    {name:"Mix",def:50,max:100},
  ]},
  0x0070000e:{name:"Ba Synth",group:"SFX",order:2200,install:0,ver:0x0010,title:"Monophonic bass synth sound",
    dsp:4.8000,dspmax:1/4,dspmin:22/100,
    param:[
    {name:"Decay",def:36,max:100},
    {name:"Wave",def:2,max:2,disp:["Saw","Pulse","PWM"]},
    {name:"Reso",def:9,max:10},
    {name:"Synth",def:100,max:100},
    {name:"Dry",def:60,max:100},
    {name:"Level",def:135,max:150},
  ]},
  0x4060000e:{name:"StdSyn",group:"SFX",order:2201,install:0,ver:0x0010,title:"ZOOM original bass synth sound",
    dsp:4.8000,dspmax:1/4,dspmin:22/100,
    param:[
    {name:"Sense",def:10,max:100},
    {name:"Sound",def:0,max:3,disp:1},
    {name:"Tone",def:7,max:10},
    {name:"Synth",def:100,max:100},
    {name:"Dry",def:40,max:100},
    {name:"Level",def:100,max:150},
  ]},
  0x0000010e:{name:"SynTlk",group:"SFX",order:2202,install:0,ver:0x0010,title:"Talking modulator like sound",
    dsp:4.8000,dspmax:1/4,dspmin:22/100,
    param:[
    {name:"Decay",def:40,max:100},
    {name:"Type",def:1,max:3,disp:["iA","UE","UA","oA"]},
    {name:"Tone",def:8,max:10},
    {name:"Synth",def:100,max:100},
    {name:"Dry",def:60,max:100},
    {name:"Level",def:100,max:150},
  ]},
  0x0020010e:{name:"Z-Syn",group:"SFX",order:2203,install:0,ver:0x0010,title:"analog bass synth sound",
    dsp:4.8000,dspmax:68/300,dspmin:16/100,
    param:[
    {name:"Wave",def:0,max:1,disp:["Saw","Sqr"]},
    {name:"Decay",def:72,max:100},
    {name:"Tone",def:7,max:10},
    {name:"Freq",def:2,max:10},
    {name:"Range",def:8,max:20},
    {name:"Reso",def:18,max:20},
    {name:"Synth",def:100,max:100},
    {name:"Dry",def:0,max:100},
    {name:"Level",def:100,max:150},
  ]},
  0x0040010e:{name:"Defret",group:"SFX",order:2204,install:0,ver:0x0010,title:"Fretless bass sound",
    dsp:10.8126,dspmax:1/10,dspmin:1/40,
    param:[
    {name:"Sense",def:11,max:30},
    {name:"Color",def:7,max:9,disp:1},
    {name:"Level",def:140,max:150},
    {name:"Tone",def:36,max:49,disp:1},
  ]},
  0x4000010e:{name:"V-Syn",group:"SFX",order:2205,install:0,ver:0x0020,title:"Vintage bass synth sound",
    dsp:4.8000,dspmax:1/4,dspmin:22/100,
    param:[
    {name:"Decay",def:24,max:100},
    {name:"Sense",def:11,max:30},
    {name:"Range",def:17,max:19,disp:["-10","-9","-8","-7","-6","-5","-4","-3","-2","-1","1","2","3","4","5","6","7","8","9","10"]},
    {name:"Synth",def:100,max:100},
    {name:"Dry",def:80,max:100},
    {name:"Level",def:100,max:150},
  ]},
  0x4020010e:{name:"4VoiceSyn",group:"SFX",order:2205,install:0,ver:0x0020,title:"Add synth harmony effect",
    dsp:6.6977,dspmax:68/300,dspmin:16/100,
    param:[
    {name:"ATTCK",def:0,max:10},
    {name:"Mode",def:3,max:8,disp:1},
    {name:"Scale",def:0,max:1,disp:1},
    {name:"Synth",def:100,max:100},
    {name:"Dry",def:100,max:100},
    {name:"Level",def:100,max:150},
  ]},


//MS-70CDR
  0x4070000c:{name:"Ba Chorus",group:"MOD",order:1000,install:0,ver:0x0110,title:"Chorus effect for bass",
    dsp:10.5744,dspmax:1/6,dspmin:2/25,
    param:[
    {name:"Depth",def:42,max:100},
    {name:"Rate",def:22,max:49,disp:1},
    {name:"Mix",def:57,max:100},
    {name:"LoCut",def:2,max:10,disp:["OFF","60Hz","120Hz","180Hz","200Hz","280Hz","340Hz","400Hz","500Hz","630Hz","800Hz"]},
    {name:"Level",def:100,max:150},
    {name:"PreD",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x0010010c:{name:"Ba Detune",group:"MOD",order:1001,install:0,ver:0x0110,title:"Mix a small amount of the pitch-shift",
    dsp:6.9314,dspmax:1/6,dspmin:16/100,
    param:[
    {name:"Cent",def:35,max:50,disp:-50,dispr:2},
    {name:"PreD",def:0,max:50,disp:0},
    {name:"Mix",def:60,max:100},
    {name:"Tone",def:8,max:10},
    {name:"Level",def:100,max:150},
    {name:"LoCut",def:1,max:10,disp:["OFF","60Hz","120Hz","180Hz","200Hz","280Hz","340Hz","400Hz","500Hz","630Hz","800Hz"]},
  ]},
  0x0070010c:{name:"Ba Ensmbl",group:"MOD",order:1002,install:0,ver:0x0110,title:"Bass chorus with 3D movement",
    dsp:7.5711,dspmax:1/6,dspmin:2/20,
    param:[
    {name:"Depth",def:48,max:100},
    {name:"Rate",def:22,max:49,disp:1},
    {name:"Mix",def:80,max:100},
    {name:"Tone",def:5,max:10},
    {name:"Level",def:100,max:150},
  ]},
  0x4050010c:{name:"BaFlanger",group:"MOD",order:1003,install:0,ver:0x0110,title:"ADA Flanger modeling",
    dsp:7.1489,dspmax:1/6,dspmin:16/100,
    param:[
    {name:"Depth",def:76,max:100},
    {name:"Rate",def:40,max:78},
    {name:"Reso",def:15,max:20,disp:-10},
    {name:"PreD",def:2,max:50},
    {name:"Mix",def:100,max:100},
    {name:"Level",def:95,max:150},
    {name:"LoCut",def:1,max:10,disp:["OFF","60Hz","120Hz","180Hz","200Hz","280Hz","340Hz","400Hz","500Hz","630Hz","800Hz"]},
  ]},
  0x0030020c:{name:"Ba Octave",group:"MOD",order:1004,install:0,ver:0x0210,title:"Adds sound one octave below",
    dsp:11.4286,dspmax:1/6,dspmin:2/25,
    param:[
    {name:"Oct",def:80,max:100},
    {name:"Dry",def:100,max:100},
    {name:"Tone",def:8,max:10},
    {name:"Low",def:3,max:10},
    {name:"Mid",def:4,max:10},
    {name:"Level",def:100,max:150},
  ]},
  0x0070020c:{name:"Ba Pitch",group:"MOD",order:1004,install:0,ver:0x0110,title:"Pitch shifter for bass",
    dsp:5.4545,dspmax:1/5,dspmin:1/6,
    param:[
    {name:"Shift",def:0,max:25,disp:["-12","-11","-10","-9","-8","-7","-6","-5","-4","-3","-2","-1","0","1","2","3","4","5","6","7","8","9","10","11","12","24"]},
    {name:"Tone",def:7,max:10},
    {name:"Bal",def:50,max:100},
    {name:"Fine",def:25,max:50,disp:-25},
    {name:"Level",def:140,max:150},
  ]},
  0x00500010:{name:"ModDelay2",group:"DELAY",order:1005,install:0,ver:0x0110,title:"Modulation delay with depth adjust",
    dsp:7.5506,dspmax:1/6,dspmin:2/25,
    param:[
    {name:"Time",def:529,max:2014,disp:1},
    {name:"F.B",def:50,max:100},
    {name:"Mix",def:45,max:100},
    {name:"Rate",def:16,max:49,disp:1},
    {name:"Level",def:100,max:150},
    {name:"Depth",def:50,max:100},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x00000204:{name:"St Bs GEQ",group:"FILTER",order:1006,install:0,ver:0x0120,title:"7 bands stereo GEQ for bass",
    dsp:5.4545,dspmax:23/125,dspmin:18/100,
    param:[
    {name:"50Hz",def:12,max:24,disp:-12},
    {name:"120Hz",def:12,max:24,disp:-12},
    {name:"400Hz",def:12,max:24,disp:-12},
    {name:"500Hz",def:12,max:24,disp:-12},
    {name:"800Hz",def:12,max:24,disp:-12},
    {name:"4.5kHz",def:12,max:24,disp:-12},
    {name:"10kHz",def:12,max:24,disp:-12},
    {name:"Level",def:100,max:150},
  ]},
  0x006a0002:{name:"160 Comp",group:"COMP",order:1008,install:0,ver:0x0210,title:"dbx 160A style comp",
    dsp:7.2000,dspmax:1/6,dspmin:16/100,
    param:[
    {name:"THRSH",def:38,max:60,disp:-60},
    {name:"Ratio",def:30,max:90,disp:1,dispr:0.1},
    {name:"Gain",def:6,max:20},
    {name:"Knee",def:0,max:1,disp:["Hard","Soft"]},
    {name:"Level",def:100,max:150},
  ]},
  0x00740002:{name:"Limiter",group:"COMP",order:1010,install:0,ver:0x0210,title:"Limiter that suppresses signal peaks",
    dsp:9.7509,dspmax:1/6,dspmin:2/25,
    param:[
    {name:"THRSH",def:20,max:50},
    {name:"Ratio",def:3,max:9},
    {name:"Level",def:90,max:150},
    {name:"REL",def:2,max:9,disp:1},
  ]},
  0x00400102:{name:"DualComp",group:"COMP",order:1012,install:0,ver:0x0220,title:"Compressor with low/high separate frequency",
    dsp:7.5358,dspmax:1/6,dspmin:16/100,
    param:[
    {name:"Hi",def:24,max:50},
    {name:"Lo",def:15,max:50},
    {name:"Freq",def:9,max:9,disp:["300Hz","400Hz","500Hz","600Hz","700Hz","800Hz","900Hz","1.0kHz","1.2kHz","1.5kHz"]},
    {name:"Level",def:100,max:150},
    {name:"Tone",def:2,max:10},
  ]},
  0x00300004:{name:"Ba GEQ",group:"FILTER",order:1020,install:0,ver:0x0210,title:"7 bands GEQ for bass",
    dsp:10.4591,dspmax:1/6,dspmin:2/20,
    param:[
    {name:"50Hz",def:12,max:24,disp:-12},
    {name:"120Hz",def:12,max:24,disp:-12},
    {name:"400Hz",def:12,max:24,disp:-12},
    {name:"500Hz",def:12,max:24,disp:-12},
    {name:"800Hz",def:12,max:24,disp:-12},
    {name:"4.5kHz",def:12,max:24,disp:-12},
    {name:"10kHz",def:12,max:24,disp:-12},
    {name:"Level",def:100,max:150},
  ]},
  0x00480004:{name:"Ba PEQ",group:"FILTER",order:1100,install:0,ver:0x0210,title:"2-band parametric equalizer for bass",
    dsp:11.2783,dspmax:1/9,dspmin:2/25,
    param:[
    {name:"Freq1",def:8,max:37,disp:[
      "20Hz","25Hz","32Hz","40Hz","50Hz","63Hz","70Hz","80Hz","100Hz","120Hz","140Hz","150Hz","160Hz",
      "180Hz","200Hz","250Hz","300Hz","350Hz","400Hz","450Hz","500Hz","630Hz","800Hz","1.0kHz","1.2kHz",
      "1.6kHz","2.0kHz","2.5kHz","3.0kHz","3.6kHz","4.0kHz","4.5kHz","6.3kHz","8.0kHz","10kHz","12kHz","16kHz","20kHz",
    ]},
    {name:"Q1",def:1,max:5,disp:["0.5","1","2","4","8","16"]},
    {name:"Gain1",def:20,max:40,disp:-20},
    {name:"Freq2",def:15,max:37,disp:[
      "20Hz","25Hz","32Hz","40Hz","50Hz","63Hz","70Hz","80Hz","100Hz","120Hz","140Hz","150Hz","160Hz",
      "180Hz","200Hz","250Hz","300Hz","350Hz","400Hz","450Hz","500Hz","630Hz","800Hz","1.0kHz","1.2kHz",
      "1.6kHz","2.0kHz","2.5kHz","3.0kHz","3.6kHz","4.0kHz","4.5kHz","6.3kHz","8.0kHz","10kHz","12kHz","16kHz","20kHz",
    ]},
    {name:"Q2",def:1,max:5,disp:["0.5","1","2","4","8","16"]},
    {name:"Gain2",def:20,max:40,disp:-20},
    {name:"Level",def:100,max:150},
  ]},
  0x00500004:{name:"Splitter",group:"FILTER",order:1101,install:0,ver:0x0210,title:"Divide into 2bands and mix with ratio",
    dsp:15.7377,dspmax:1/9,dspmin:2/25,
    param:[
    {name:"Hi",def:19,max:50,disp:0,dispr:2},
    {name:"Lo",def:16,max:50,disp:0,dispr:2},
    {name:"Freq",def:2,max:15,disp:["80Hz","100Hz","125Hz","160Hz","200hz","250Hz","315Hz","400Hz","500Hz","630Hz","800Hz","1.0kHz","1.3kHz","1.6kHz","2.0kHz","2.5kHz",]},
    {name:"Level",def:95,max:150},
  ]},
  0x00580004:{name:"Bottom B",group:"FILTER",order:1102,install:0,ver:0x0210,title:"Emphasizes low/high frequencies",
    dsp:10.7592,dspmax:1/6,dspmin:2/20,
    param:[
    {name:"Bass",def:6,max:10},
    {name:"Trebl",def:7,max:10},
    {name:"Level",def:60,max:150},
  ]},
  0x40300004:{name:"BaAutoWah",group:"FILTER",order:1103,install:0,ver:0x0210,title:"Auto wah for bass",
    dsp:11.4685,dspmax:1/9,dspmin:2/25,
    param:[
    {name:"Sense",def:11,max:19,disp:["-10","-9","-8","-7","-6","-5","-4","-3","-2","-1","1","2","3","4","5","6","7","8","9","10"]},
    {name:"Reso",def:8,max:10},
    {name:"Dry",def:0,max:100},
    {name:"Level",def:100,max:150},
  ]},
  0x00100104:{name:"Z Tron",group:"FILTER",order:1104,install:0,ver:0x0210,title:"Envelope Filter like Q-Tron in LP mode",
    dsp:14.7735,dspmax:1/9,dspmin:2/25,
    param:[
    {name:"Sense",def:12,max:19,disp:["-10","-9","-8","-7","-6","-5","-4","-3","-2","-1","1","2","3","4","5","6","7","8","9","10"]},
    {name:"Reso",def:7,max:10},
    {name:"Dry",def:25,max:100},
    {name:"Level",def:108,max:150},
  ]},
  0x002a0104:{name:"A-Filter",group:"FILTER",order:1105,install:0,ver:0x0210,title:"Resonance filter with a sharp envelope",
    dsp:14.4594,dspmax:1/6,dspmin:2/25,
    param:[
    {name:"Sense",def:7,max:9,disp:1},
    {name:"Peak",def:7,max:10},
    {name:"Mode",def:0,max:1,disp:["Up","Down"]},
    {name:"Dry",def:10,max:100},
    {name:"Level",def:100,max:150},
  ]},
  0x00340104:{name:"Ba Cry",group:"FILTER",order:1106,install:0,ver:0x0210,title:"Bass frequency talking modulator",
    dsp:9.0000,dspmax:1/6,dspmin:2/20,
    param:[
    {name:"Range",def:4,max:9,disp:1},
    {name:"Reso",def:8,max:10},
    {name:"Sense",def:16,max:19,disp:["-10","-9","-8","-7","-6","-5","-4","-3","-2","-1","1","2","3","4","5","6","7","8","9","10"]},
    {name:"Bal",def:100,max:100},
    {name:"Level",def:100,max:150},
  ]},

//MS-50G
  0x00100002:{name:"Comp",group:"COMP",order:100,install:0,ver:0x0201,title:"MXR DynaComp style comp",
    dsp:14.2979,dspmax:1/12,dspmin:2/25,
    param:[
    {name:"Sense",def:6,max:10},
    {name:"Tone",def:6,max:10},
    {name:"Level",def:100,max:150},
    {name:"ATTCK",def:0,max:1,disp:["Slow","Fast"]}
  ]},
  0x00200002:{name:"RackComp",group:"COMP",order:101,install:0,ver:0x0221,title:"Comp with more detailed parameter",
    dsp:11.9657,dspmax:1/10,dspmin:2/25,
    param:[
    {name:"THRSH",def:40,max:50},
    {name:"Ratio",def:5,max:9,disp:1},
    {name:"Level",def:100,max:150},
    {name:"ATTCK",def:6,max:9,disp:1}
  ]},
  0x00400002:{name:"M Comp",group:"COMP",order:102,install:0,ver:0x0212,title:"More natural sound comp",
    dsp:10.0229,dspmax:1/10,dspmin:2/25,
    param:[
    {name:"THRSH",def:40,max:50},
    {name:"Ratio",def:3,max:9,disp:1},
    {name:"Level",def:100,max:150},
    {name:"ATTCK",def:0,max:9,disp:1}
  ]},
  0x00600002:{name:"OptComp",group:"COMP",order:103,install:0,ver:0x0212,title:"APHex Punch FACTORY style comp",
    dsp:7.5045,dspmax:1/6,dspmin:16/100,
    param:[
    {name:"Drive",def:7,max:10},
    {name:"Tone",def:54,max:100},
    {name:"Level",def:50,max:150}
  ]},
  0x40000002:{name:"SlowATTCK",group:"COMP",order:104,install:0,ver:0x0211,title:"Violin like slow attack sounds",
    dsp:12.0646,dspmax:1/12,dspmin:2/25,
    param:[
    {name:"Time",def:20,max:49,disp:1},
    {name:"Curve",def:10,max:10},
    {name:"Level",def:100,max:150}
  ]},
  0x40200002:{name:"ZNR",group:"COMP",order:105,install:0,ver:0x0111,title:"ZOOM's unique noise reduction",
    dsp:17.4545,dspmax:1/12,dspmin:1/30,
    param:[
    {name:"THRSH",def:9,max:24,disp:1},
    {name:"DETCT",def:1,max:1,disp:["GtrIn","EfxIn"]},
    {name:"Level",def:100,max:150}
  ]},
  0x40400002:{name:"NoiseGate",group:"COMP",order:106,install:0,ver:0x0222,title:"Cuts the sound during playing pauses",
    dsp:14.1548,dspmax:1/12,dspmin:1/30,
    param:[
    {name:"THRSH",def:9,max:24,disp:1},
    {name:"Level",def:100,max:150}
  ]},
  0x40600002:{name:"DirtyGate",group:"COMP",order:107,install:0,ver:0x0223,title:"Gate with vintage style way of closing",
    dsp:16.0624,dspmax:1/12,dspmin:2/25,
    param:[
    {name:"THRSH",def:9,max:24,disp:1},
    {name:"Level",def:100,max:150}
  ]},
  0x00000102:{name:"OrangeLim",group:"COMP",order:108,install:0,ver:0x0223,title:"ORANGE SQUEEZER modeling",
    dsp:5.4545,dspmax:23/125,dspmin:823/4500,
    param:[]},
  0x00200102:{name:"GrayComp",group:"COMP",order:109,install:0,ver:0x0223,title:"ROSS Compressor modiling",
    dsp:4.8276,dspmax:68/300,dspmin:1/5,
    param:[
    {name:"SUSTN",def:63,max:100},
    {name:"OUT",def:88,max:100}
  ]},
  0x00100004:{name:"LineSel",group:"FILTER",order:200,install:0,ver:0x0111,title:"Send directly to OUTPUT when OFF",
    dsp:17.6121,dspmax:1/12,dspmin:1/30,
    param:[
    {name:"EFX_L",def:100,max:150},
    {name:"OUT_L",def:100,max:150}
  ]},
  0x00200004:{name:"GraphicEQ",group:"FILTER",order:201,install:0,ver:0x0201,title:"6-band quealizer",
    dsp:11.6667,dspmax:1/12,dspmin:2/25,
    param:[
    {name:"160Hz",def:12,max:24,disp:-12},
    {name:"400Hz",def:12,max:24,disp:-12},
    {name:"800Hz",def:12,max:24,disp:-12},
    {name:"3.2kHz",def:12,max:24,disp:-12},
    {name:"6.4kHz",def:12,max:24,disp:-12},
    {name:"12kHz",def:12,max:24,disp:-12},
    {name:"Level",def:100,max:150}
  ]},
  0x00400004:{name:"ParaEQ",group:"FILTER",order:202,install:0,ver:0x0201,title:"2-band parametric equalizer",
    dsp:16.0000,dspmax:1/12,dspmin:1/30,
    param:[
    {name:"Freq1",def:8,max:30,
      disp:["20Hz","25Hz","32Hz","40Hz","50Hz","63Hz","80Hz","100Hz","125Hz","160Hz","200Hz","250Hz","320Hz","400Hz","500Hz","630Hz",
      "800Hz","1.0kHz","1.2kHz","1.6kHz","2.0kHz","2.5kHz","3.2kHz","4.0kHz","5.0kHz","6.3kHz","8.0kHz","10kHz","12kHz","16kHz","20kHz"]},
    {name:"Q1",def:1,max:5,disp:["0.5","1","2","4","8","16"]},
    {name:"Gain1",def:12,max:24,disp:-12},
    {name:"Freq2",def:15,max:30,
      disp:["20Hz","25Hz","32Hz","40Hz","50Hz","63Hz","80Hz","100Hz","125Hz","160Hz","200Hz","250Hz","320Hz","400Hz","500Hz","630Hz",
      "800Hz","1.0kHz","1.2kHz","1.6kHz","2.0kHz","2.5kHz","3.2kHz","4.0kHz","5.0kHz","6.3kHz","8.0kHz","10kHz","12kHz","16kHz","20kHz"]},
    {name:"Q2",def:1,max:5,disp:["0.5","1","2","4","8","16"]},
    {name:"Gain2",def:12,max:24,disp:-12},
    {name:"Level",def:100,max:150}
  ]},
  0x00600004:{name:"Exciter",group:"FILTER",order:203,install:0,ver:0x0212,title:"2-band phase exciter",
    dsp:11.8597,dspmax:1/10,dspmin:2/25,
    param:[
    {name:"Bass",def:0,max:100},
    {name:"Trebl",def:0,max:100},
    {name:"Level",def:100,max:150}
  ]},
  0x40000004:{name:"CombFLTR",group:"FILTER",order:204,install:0,ver:0x0202,title:"Comb filter, that like fix modulated flanger",
    dsp:12.6000,dspmax:1/10,dspmin:2/25,
    param:[
    {name:"Freq",def:24,max:49,disp:1},
    {name:"Reso",def:15,max:20,disp:-10},
    {name:"Mix",def:30,max:100},
    {name:"HiDMP",def:6,max:10},
    {name:"Level",def:100,max:150}
  ]},
  0x40200004:{name:"AutoWah",group:"FILTER",order:205,install:0,ver:0x0201,title:"Wah accordance with picking intensity",
    dsp:10.1045,dspmax:1/10,dspmin:2/25,
    param:[
    {name:"Sense",def:17,max:19,disp:["-10","-9","-8","-7","-6","-5","-4","-3","-2","-1","1","2","3","4","5","6","7","8","9","10"]},
    {name:"Reso",def:8,max:10},
    {name:"Level",def:100,max:150}
  ]},
  0x40400004:{name:"Resonance",group:"FILTER",order:206,install:0,ver:0x0202,title:"Resonance filter according to picking intensisty",
    dsp:9.9802,dspmax:1/10,dspmin:2/25,
    param:[
    {name:"Sense",def:14,max:19,disp:["-10","-9","-8","-7","-6","-5","-4","-3","-2","-1","1","2","3","4","5","6","7","8","9","10"]},
    {name:"Reso",def:8,max:10},
    {name:"Level",def:100,max:150}
  ]},
  0x40600004:{name:"Cry",group:"FILTER",order:207,install:0,ver:0x0201,title:"Like the talking modulator",
    dsp:11.9290,dspmax:1/12,dspmin:2/25,
    param:[
    {name:"Range",def:6,max:9,disp:1},
    {name:"Reso",def:8,max:10},
    {name:"Sense",def:16,max:19,disp:["-10","-9","-8","-7","-6","-5","-4","-3","-2","-1","1","2","3","4","5","6","7","8","9","10"]},
    {name:"Bal",def:100,max:100},
    {name:"Level",def:100,max:150}]},
  0x00000104:{name:"SlowFLTR",group:"FILTER",order:208,install:0,ver:0x0203,title:"Filter changing by picking trigger",
    dsp:7.2000,dspmax:1/6,dspmin:2/25,
    param:[
    {name:"Time",def:20,max:49,disp:1},
    {name:"Curve",def:10,max:10},
    {name:"Level",def:100,max:150},
    {name:"Reso",def:6,max:10},
    {name:"Chara",def:1,max:1,disp:["2Pole","4Pole"]},
    {name:"DRCTN",def:0,max:1,disp:["Open","Close"]}
  ]},
  0x00200104:{name:"M-Filter",group:"FILTER",order:209,install:0,ver:0x0211,title:"Evelope filter with Moog MF-101 like LPF",
    dsp:8.0000,dspmax:1/10,dspmin:2/25,
    param:[
    {name:"Freq",def:56,max:100},
    {name:"Sense",def:5,max:10},
    {name:"Reso",def:7,max:10},
    {name:"Type",def:2,max:2,disp:["HPF","BPF","LPF"]},
    {name:"Chara",def:1,max:1,disp:["2Pole","4Pole"]},
    {name:"VLCTY",def:0,max:1,disp:["Fast","Slow"]},
    {name:"Bal",def:100,max:100},
    {name:"Level",def:100,max:150}
  ]},
  0x00400104:{name:"Step",group:"FILTER",order:210,install:0,ver:0x0201,title:"Special effect for sound stepping",
    dsp:11.2783,dspmax:1/10,dspmin:2/25,
    param:[
    {name:"Depth",def:60,max:100},
    {name:"Rate",def:25,max:78},
    {name:"Reso",def:8,max:10},
    {name:"Shape",def:10,max:10},
    {name:"Level",def:100,max:150}
  ]},
  0x00600104:{name:"SeqFLTR",group:"FILTER",order:211,install:0,ver:0x0211,title:"Z.Vex Seek-Wah like sequence filter",
    dsp:9.6000,dspmax:1/10,dspmin:2/25,
    param:[
    {name:"Step",def:6,max:6,disp:2},
    {name:"PTTRN",def:6,max:7,disp:1},
    {name:"Speed",def:25,max:77,disp:1},
    {name:"Shape",def:10,max:10},
    {name:"Reso",def:10,max:10},
    {name:"Level",def:100,max:150}
  ]},
  0x40000104:{name:"RndmFLTR",group:"FILTER",order:212,install:0,ver:0x0222,title:"Randomly changing filter",
    dsp:9.6000,dspmax:1/10,dspmin:2/25,
    param:[
    {name:"Speed",def:34,max:77,disp:1},
    {name:"Range",def:50,max:100},
    {name:"Reso",def:6,max:10},
    {name:"Type",def:2,max:2,disp:["HPF","BPF","LPF"]},
    {name:"Chara",def:1,max:1,disp:["2Pole","4Pole"]},
    {name:"Bal",def:90,max:100},
    {name:"Level",def:100,max:150}
  ]},
  0x40200104:{name:"fCycle",group:"FILTER",order:213,install:0,ver:0x0222,title:"Cyclic changing filter",
    dsp:10.1045,dspmax:1/10,dspmin:2/25,
    param:[
    {name:"Rate",def:5,max:77,disp:1},
    {name:"Wave",def:3,max:3,disp:["Sine","Tri","SawUp","SawDn"]},
    {name:"Level",def:100,max:150},
    {name:"Depth",def:100,max:100},
    {name:"Reso",def:8,max:10}
  ]},
  0x40400104:{name:"St Gt GEQ",group:"FILTER",order:214,install:0,ver:0x0103,title:"6-bands Stereo Graphic equalizer for guitar",
    dsp:7.2000,dspmax:1/6,dspmin:33/250,
    param:[
    {name:"160Hz",def:12,max:24,disp:-12},
    {name:"400Hz",def:12,max:24,disp:-12},
    {name:"800Hz",def:12,max:24,disp:-12},
    {name:"3.2kHz",def:12,max:24,disp:-12},
    {name:"6.4kHz",def:12,max:24,disp:-12},
    {name:"12kHz",def:12,max:24,disp:-12},
    {name:"Level",def:100,max:150}
  ]},
  0x00100006:{name:"Booster",group:"DRIVE",order:300,install:0,ver:0x0001,title:"Boost signal gain for more power",
    dsp:7.9892,dspmax:1/6,dspmin:1/10,
    param:[
    {name:"Gain",def:80,max:100},
    {name:"Tone",def:50,max:100},
    {name:"Level",def:100,max:150}
  ]},
  0x00200006:{name:"OverDrive",group:"DRIVE",order:301,install:0,ver:0x0001,title:"BOSS OD-1 Overdrive modiling",
    dsp:7.9892,dspmax:1/6,dspmin:1/10,
    param:[
    {name:"Gain",def:60,max:100},
    {name:"Tone",def:50,max:100},
    {name:"Level",def:100,max:150}
  ]},
  0x00400006:{name:"T Scream",group:"DRIVE",order:302,install:0,ver:0x0001,title:"Ibanez TS808 modeling",
    dsp:7.9892,dspmax:1/6,dspmin:1/10,
    param:[
    {name:"Gain",def:70,max:100},
    {name:"Tone",def:50,max:100},
    {name:"Level",def:100,max:150}
  ]},
  0x00600006:{name:"Governor",group:"DRIVE",order:303,install:0,ver:0x0002,title:"Marshall Guv'nor distortion modeling",
    dsp:7.9892,dspmax:1/6,dspmin:1/10,
    param:[
    {name:"Gain",def:60,max:100},
    {name:"Tone",def:50,max:100},
    {name:"Level",def:100,max:150}
  ]},
  0x40000006:{name:"Dist+",group:"DRIVE",order:304,install:0,ver:0x0001,title:"MXR distortion+ modeling",
    dsp:7.9892,dspmax:1/6,dspmin:1/10,
    param:[
    {name:"Gain",def:80,max:100},
    {name:"Tone",def:50,max:100},
    {name:"Level",def:100,max:150}
  ]},
  0x40200006:{name:"Dist 1",group:"DRIVE",order:305,install:0,ver:0x0001,title:"BOSS DS-1 distortion modeling",
    dsp:7.9892,dspmax:1/6,dspmin:1/10,
    param:[
    {name:"Gain",def:60,max:100},
    {name:"Tone",def:50,max:100},
    {name:"Level",def:100,max:150}
  ]},
  0x40400006:{name:"Squeak",group:"DRIVE",order:306,install:0,ver:0x0001,title:"Pro Co Rat distortion modeling",
    dsp:7.9892,dspmax:1/6,dspmin:1/10,
    param:[
    {name:"Gain",def:40,max:100},
    {name:"Tone",def:50,max:100},
    {name:"Level",def:100,max:150}
  ]},
  0x40600006:{name:"FuzzSmile",group:"DRIVE",order:307,install:0,ver:0x0002,title:"Fuzz Face modeling",
    dsp:7.9892,dspmax:1/6,dspmin:1/10,
    param:[
    {name:"Gain",def:70,max:100},
    {name:"Tone",def:50,max:100},
    {name:"Level",def:100,max:150}
  ]},
  0x00000106:{name:"GreatMuff",group:"DRIVE",order:308,install:0,ver:0x0001,title:"Electro-Harmonix Big Muff modeling",
    dsp:7.9892,dspmax:1/6,dspmin:1/10,
    param:[
    {name:"Gain",def:70,max:100},
    {name:"Tone",def:50,max:100},
    {name:"Level",def:100,max:150}
  ]},
  0x00200106:{name:"MetalWRLD",group:"DRIVE",order:309,install:0,ver:0x0001,title:"BOSS Meta Zone modeling",
    dsp:7.9892,dspmax:1/6,dspmin:1/10,
    param:[
    {name:"Gain",def:60,max:100},
    {name:"Tone",def:50,max:100},
    {name:"Level",def:100,max:150}
  ]},
  0x00400106:{name:"HotBox",group:"DRIVE",order:310,install:0,ver:0x0001,title:"Matchless Hotbox pre-amp modeling",
    dsp:7.9892,dspmax:1/6,dspmin:1/10,
    param:[
    {name:"Gain",def:60,max:100},
    {name:"Tone",def:50,max:100},
    {name:"Level",def:100,max:150}
  ]},
  0x00600106:{name:"Z Clean",group:"DRIVE",order:311,install:0,ver:0x0001,title:"ZOOM original clean sound",
    dsp:7.9892,dspmax:1/6,dspmin:1/10,
    param:[
    {name:"Gain",def:60,max:100},
    {name:"Tone",def:50,max:100},
    {name:"Level",def:100,max:150}
  ]},
  0x40000106:{name:"Z MP 1",group:"DRIVE",order:312,install:0,ver:0x0002,title:"Original sounds with ADA MP1 + Marshall JCM800",
    dsp:7.9892,dspmax:1/6,dspmin:1/10,
    param:[
    {name:"Gain",def:60,max:100},
    {name:"Tone",def:50,max:100},
    {name:"Level",def:100,max:150}
  ]},
  0x40200106:{name:"Z Bottom",group:"DRIVE",order:313,install:0,ver:0x0002,title:"High gain sound with low-mid emphasis",
    dsp:7.9892,dspmax:1/6,dspmin:1/10,
    param:[
    {name:"Gain",def:60,max:100},
    {name:"Tone",def:50,max:100},
    {name:"Level",def:100,max:150}
  ]},
  0x40400106:{name:"Z Dream",group:"DRIVE",order:314,install:0,ver:0x0002,title:"High gain sounds based on Mesa Boogie Road King Series II Lead",
    dsp:7.9892,dspmax:1/6,dspmin:1/10,
    param:[
    {name:"Gain",def:60,max:100},
    {name:"Tone",def:50,max:100},
    {name:"Level",def:100,max:150}
  ]},
  0x40600106:{name:"Z Scream",group:"DRIVE",order:315,install:0,ver:0x0002,title:"Original balanced high-gain sounds",
    dsp:7.9892,dspmax:1/6,dspmin:1/10,
    param:[
    {name:"Gain",def:60,max:100},
    {name:"Tone",def:50,max:100},
    {name:"Level",def:100,max:150}
  ]},
  0x00000206:{name:"Z Neos",group:"DRIVE",order:316,install:0,ver:0x0002,title:"Crunch soudns of British class A combo amp",
    dsp:7.9892,dspmax:1/6,dspmin:1/10,
    param:[
    {name:"Gain",def:60,max:100},
    {name:"Tone",def:50,max:100},
    {name:"Level",def:100,max:150}
  ]},
  0x00200206:{name:"Z Wild",group:"DRIVE",order:317,install:0,ver:0x0002,title:"High-gain sound even more overdrive",
    dsp:7.9892,dspmax:1/6,dspmin:1/10,
    param:[
    {name:"Gain",def:60,max:100},
    {name:"Tone",def:50,max:100},
    {name:"Level",def:100,max:150}
  ]},
  0x00400206:{name:"Lead",group:"DRIVE",order:318,install:0,ver:0x0002,title:"Bright and smooth distortion",
    dsp:7.9892,dspmax:1/6,dspmin:1/10,
    param:[
    {name:"Gain",def:60,max:100},
    {name:"Tone",def:50,max:100},
    {name:"Level",def:100,max:150}
  ]},
  0x00600206:{name:"ExtremeDS",group:"DRIVE",order:319,install:0,ver:0x0001,title:"Highest gain distortion",
    dsp:7.9892,dspmax:1/6,dspmin:1/10,
    param:[
    {name:"Gain",def:60,max:100},
    {name:"Tone",def:50,max:100},
    {name:"Level",def:100,max:150}
  ]},
  0x40000206:{name:"Aco.Sim",group:"DRIVE",order:320,install:0,ver:0x0001,title:"Acoustic guitar simulator",
    dsp:7.9892,dspmax:1/6,dspmin:1/10,
    param:[
    {name:"Top",def:80,max:100},
    {name:"Body",def:50,max:100},
    {name:"Level",def:100,max:150}
  ]},
  0x40200206:{name:"CentaGold",group:"DRIVE",order:321,install:0,ver:0x0003,title:"Klon Centaur Gold overdrive modeling",
    dsp:4.4444,dspmax:1/4,dspmin:1/5,
    param:[
    {name:"GAIN",def:69,max:100},
    {name:"TRBL",def:56,max:100},
    {name:"OUT",def:43,max:100}
  ]},
  0x40400206:{name:"NYC Muff",group:"DRIVE",order:322,install:0,ver:0x0003,title:"Electro-Harmonix Big Muff Pi modeling",
    dsp:6.9604,dspmax:1/6,dspmin:33/250,
    param:[
    {name:"VOL",def:58,max:100},
    {name:"TONE",def:55,max:100},
    {name:"SUSTN",def:70,max:100}
  ]},
  0x40600206:{name:"TS Drive",group:"DRIVE",order:323,install:0,ver:0x0003,title:"Ibanez TS808 modeling",
    dsp:5.5385,dspmax:1/5,dspmin:1/6,
    param:[
    {name:"O.DRV",def:74,max:100},
    {name:"TONE",def:57,max:100},
    {name:"LEVEL",def:82,max:100}
  ]},
  0x00000306:{name:"BG_THRTTL",group:"DRIVE",order:324,install:0,ver:0x0003,title:"Mesa Boogie THROTTLE BOX modeling",
    dsp:2.8366,dspmax:13/36,dspmin:1/3,
    param:[
    {name:"LEVEL",def:54,max:100},
    {name:"LO/HI",def:1,max:1,disp:["LO","HI"]},
    {name:"GAIN",def:78,max:100},
    {name:"MdCut",def:46,max:100},
    {name:"TONE",def:56,max:100},
    {name:"BOOST",def:1,max:1,disp:["OFF","ON"]}
  ]},
  0x00200306:{name:"OctFuzz",group:"DRIVE",order:325,install:0,ver:0x0003,title:"Fuzz adding an octave above",
    dsp:4.4444,dspmax:1/4,dspmin:1/5,
    param:[
    {name:"VOL",def:68,max:100},
    {name:"COLOR",def:1,max:1,disp:["1","2"]},
    {name:"BOOST",def:65,max:100}
  ]},
  0x00400306:{name:"BG GRID",group:"DRIVE",order:326,install:0,ver:0x0003,title:"Mesa Boogie GRID SLAMMER modeling",
    dsp:3.4286,dspmax:37/144,dspmin:1/4,
    param:[
    {name:"LEVEL",def:74,max:100},
    {name:"TONE",def:50,max:100},
    {name:"GAIN",def:68,max:100}
  ]},
  0x00600306:{name:"RedCrunch",group:"DRIVE",order:327,install:0,ver:0x0003,title:"Effect for EVH 'Brown Sound'",
    dsp:4.4444,dspmax:1/4,dspmin:28/125,
    param:[
    {name:"VOL",def:61,max:100},
    {name:"LO/HI",def:1,max:1,disp:["LO","HI"]},
    {name:"GAIN",def:68,max:100},
    {name:"PRES",def:48,max:100},
    {name:"COMP",def:0,max:2,disp:["1","0","2"]},
    {name:"TONE",def:47,max:100}
  ]},
  0x40000306:{name:"TB MK1.5",group:"DRIVE",order:328,install:0,ver:0x0003,title:"Classic fuzz",
    dsp:3.4286,dspmax:28/100,dspmin:1/4,
    param:[
    {name:"LEVEL",def:92,max:100},
    {name:"COLOR",def:1,max:1,disp:["1","2"]},
    {name:"ATTCK",def:90,max:100}
  ]},
  0x40200306:{name:"SweetDrv",group:"DRIVE",order:329,install:0,ver:0x0003,title:"Modeling of a sweet sounding overdrive",
    dsp:2.6334,dspmax:38/100,dspmin:1/3,
    param:[
    {name:"VOL",def:62,max:100},
    {name:"FOCUS",def:67,max:100},
    {name:"DRIVE",def:78,max:100}
  ]},
  0x40600306:{name:"RC Boost",group:"DRIVE",order:330,install:0,ver:0x0003,title:"Booster for from clean to light drives",
    dsp:4.4444,dspmax:1/4,dspmin:2/9,
    param:[
    {name:"GAIN",def:58,max:100},
    {name:"TRBL",def:52,max:100},
    {name:"BASS",def:48,max:100},
    {name:"VOL",def:48,max:100}
  ]},
  0x00200406:{name:"DynmcDrv",group:"DRIVE",order:331,install:0,ver:0x0003,title:"Warm drive tone of a tube amp",
    dsp:3.4286,dspmax:28/100,dspmin:1/4,
    param:[
    {name:"LEVEL",def:62,max:100},
    {name:"TONE",def:67,max:100},
    {name:"GAIN",def:78,max:100},
    {name:"MODE",def:1,max:1,disp:["COMBO","STACK"]}
  ]},
  0x00100008:{name:"FD COMBO",group:"AMP",order:400,install:0,ver:0x0001,title:"Fender Twin Reverb ('65) modeling",
    dsp:3.1102,dspmax:1/3,dspmin:1/4,
    param:[
    {name:"Gain",def:24,max:100},
    {name:"Tube",def:30,max:100},
    {name:"Level",def:86,max:150},
    {name:"Trebl",def:48,max:100},
    {name:"Middl",def:45,max:100},
    {name:"Bass",def:44,max:100},
    {name:"Prese",def:52,max:100},
    {name:"CAB",def:8,max:gampcabmax,disp:gampcabdisp},
    {name:"OUT",def:0,max:4,disp:["LINE","COMBO FRONT","STACK FRONT","COMBO POWER AMP","STACK POWER AMP",]}
  ]},
  0x00200008:{name:"DELUXE-R",group:"AMP",order:401,install:0,ver:0x0001,title:"Fender Deluxe Reverb ('65) modeling",
    dsp:2.3404,dspmax:41/100,dspmin:547/1500,
    param:[
    {name:"Gain",def:50,max:100},
    {name:"Tube",def:30,max:100},
    {name:"Level",def:100,max:150},
    {name:"Trebl",def:50,max:100},
    {name:"Middl",def:50,max:100},
    {name:"Bass",def:50,max:100},
    {name:"Prese",def:50,max:100},
    {name:"CAB",def:16,max:gampcabmax,disp:gampcabdisp},
    {name:"OUT",def:0,max:4,disp:["LINE","COMBO FRONT","STACK FRONT","COMBO POWER AMP","STACK POWER AMP",]}
  ]},
  0x00400008:{name:"FD VIBRO",group:"AMP",order:402,install:0,ver:0x0003,title:"Fender Vibroverb ('63) modeling",
    dsp:3.1102,dspmax:1/3,dspmin:1/4,
    param:[
    {name:"Gain",def:56,max:100},
    {name:"Tube",def:30,max:100},
    {name:"Level",def:98,max:150},
    {name:"Trebl",def:54,max:100},
    {name:"Middl",def:50,max:100},
    {name:"Bass",def:47,max:100},
    {name:"Prese",def:52,max:100},
    {name:"CAB",def:32,max:gampcabmax,disp:gampcabdisp},
    {name:"OUT",def:0,max:4,disp:["LINE","COMBO FRONT","STACK FRONT","COMBO POWER AMP","STACK POWER AMP",]}
  ]},
  0x00600008:{name:"US BLUES",group:"AMP",order:403,install:0,ver:0x0001,title:"Fender Tweed Bassman modeling",
    dsp:3.1102,dspmax:1/3,dspmin:1/4,
    param:[
    {name:"Gain",def:59,max:100},
    {name:"Tube",def:30,max:100},
    {name:"Level",def:107,max:150},
    {name:"Trebl",def:46,max:100},
    {name:"Middl",def:50,max:100},
    {name:"Bass",def:48,max:100},
    {name:"Prese",def:58,max:100},
    {name:"CAB",def:48,max:gampcabmax,disp:gampcabdisp},
    {name:"OUT",def:0,max:4,disp:["LINE","COMBO FRONT","STACK FRONT","COMBO POWER AMP","STACK POWER AMP",]}]},
  0x40000008:{name:"VX COMBO",group:"AMP",order:404,install:0,ver:0x0003,title:"British combo amp modeling",
    dsp:3.1102,dspmax:1/3,dspmin:1/4,
    param:[
    {name:"Gain",def:31,max:100},
    {name:"Tube",def:30,max:100},
    {name:"Level",def:100,max:150},
    {name:"Trebl",def:44,max:100},
    {name:"Middl",def:50,max:100},
    {name:"Bass",def:49,max:100},
    {name:"Prese",def:53,max:100},
    {name:"CAB",def:64,max:gampcabmax,disp:gampcabdisp},
    {name:"OUT",def:0,max:4,disp:["LINE","COMBO FRONT","STACK FRONT","COMBO POWER AMP","STACK POWER AMP",]}]},
  0x40200008:{name:"VX JMI",group:"AMP",order:405,install:0,ver:0x0001,title:"Class-A British combo amp modeling",
    dsp:2.3404,dspmax:41/100,dspmin:547/1500,
    param:[
    {name:"Gain",def:50,max:100},
    {name:"Tube",def:30,max:100},
    {name:"Level",def:100,max:150},
    {name:"Trebl",def:50,max:100},
    {name:"Middl",def:50,max:100},
    {name:"Bass",def:50,max:100},
    {name:"Prese",def:50,max:100},
    {name:"CAB",def:80,max:gampcabmax,disp:gampcabdisp},
    {name:"OUT",def:0,max:4,disp:[
      "LINE","COMBO FRONT","STACK FRONT","COMBO POWER AMP","STACK POWER AMP",]}]},
  0x40400008:{name:"BG CRUNCH",group:"AMP",order:406,install:0,ver:0x0003,title:"Mesa Boogie MkIII modeling",
    dsp:3.1102,dspmax:1/3,dspmin:1/4,
    param:[
    {name:"Gain",def:57,max:100},
    {name:"Tube",def:30,max:100},
    {name:"Level",def:99,max:150},
    {name:"Trebl",def:50,max:100},
    {name:"Middl",def:50,max:100},
    {name:"Bass",def:50,max:100},
    {name:"Prese",def:60,max:100},
    {name:"CAB",def:96,max:gampcabmax,disp:gampcabdisp},
    {name:"OUT",def:0,max:4,disp:["LINE","COMBO FRONT","STACK FRONT","COMBO POWER AMP","STACK POWER AMP",]}]},
  0x40600008:{name:"MATCH 30",group:"AMP",order:408,install:0,ver:0x0003,title:"Matchless DC-30(channel-1) modeling",
    dsp:3.1102,dspmax:1/3,dspmin:1/4,
    param:[
    {name:"Gain",def:28,max:100},
    {name:"Tube",def:30,max:100},
    {name:"Level",def:100,max:150},
    {name:"Trebl",def:46,max:100},
    {name:"Middl",def:46,max:100},
    {name:"Bass",def:45,max:100},
    {name:"Prese",def:53,max:100},
    {name:"CAB",def:112,max:gampcabmax,disp:gampcabdisp},
    {name:"OUT",def:0,max:4,disp:["LINE","COMBO FRONT","STACK FRONT","COMBO POWER AMP","STACK POWER AMP",]}]},
  0x00000108:{name:"CAR DRIVE",group:"AMP",order:409,install:0,ver:0x0003,title:"Carr Mercury combo amp modeling",
    dsp:2.3404,dspmax:41/100,dspmin:547/1500,
    param:[
    {name:"Gain",def:51,max:100},
    {name:"Tube",def:30,max:100},
    {name:"Level",def:74,max:150},
    {name:"Trebl",def:50,max:100},
    {name:"Middl",def:50,max:100},
    {name:"Bass",def:50,max:100},
    {name:"Prese",def:50,max:100},
    {name:"CAB",def:128,max:gampcabmax,disp:gampcabdisp},
    {name:"OUT",def:0,max:4,disp:["LINE","COMBO FRONT","STACK FRONT","COMBO POWER AMP","STACK POWER AMP",]}]},
  0x00200108:{name:"TW ROCK",group:"AMP",order:410,install:0,ver:0x0001,title:"Two Rock Emerald 50 drive channel",
    dsp:3.1102,dspmax:1/3,dspmin:1/4,
    param:[
    {name:"Gain",def:53,max:100},
    {name:"Tube",def:30,max:100},
    {name:"Level",def:95,max:150},
    {name:"Trebl",def:50,max:100},
    {name:"Middl",def:50,max:100},
    {name:"Bass",def:51,max:100},
    {name:"Prese",def:50,max:100},
    {name:"CAB",def:144,max:gampcabmax,disp:gampcabdisp},
    {name:"OUT",def:0,max:4,disp:["LINE","COMBO FRONT","STACK FRONT","COMBO POWER AMP","STACK POWER AMP",]}]},
  0x00400108:{name:"TONE CITY",group:"AMP",order:411,install:0,ver:0x0003,title:"Sound City 50 Plus Mark 2 modeling",
    dsp:2.3404,dspmax:41/100,dspmin:547/1500,
    param:[
    {name:"Gain",def:78,max:100},
    {name:"Tube",def:30,max:100},
    {name:"Level",def:89,max:150},
    {name:"Trebl",def:54,max:100},
    {name:"Middl",def:50,max:100},
    {name:"Bass",def:46,max:100},
    {name:"Prese",def:52,max:100},
    {name:"CAB",def:160,max:gampcabmax,disp:gampcabdisp},
    {name:"OUT",def:0,max:4,disp:["LINE","COMBO FRONT","STACK FRONT","COMBO POWER AMP","STACK POWER AMP",]}]},
  0x00600108:{name:"HW STACK",group:"AMP",order:412,install:0,ver:0x0003,title:"Hiwatt Custom 100 tube amp modeling",
    dsp:3.1102,dspmax:1/3,dspmin:1/4,
    param:[
    {name:"Gain",def:54,max:100},
    {name:"Tube",def:30,max:100},
    {name:"Level",def:106,max:150},
    {name:"Trebl",def:46,max:100},
    {name:"Middl",def:50,max:100},
    {name:"Bass",def:56,max:100},
    {name:"Prese",def:52,max:100},
    {name:"CAB",def:176,max:gampcabmax,disp:gampcabdisp},
    {name:"OUT",def:0,max:4,disp:["LINE","COMBO FRONT","STACK FRONT","COMBO POWER AMP","STACK POWER AMP",]}]},
  0x40000108:{name:"TANGERINE",group:"AMP",order:413,install:0,ver:0x0003,title:"Orange Graphic 120 modeling",
    dsp:3.1102,dspmax:1/3,dspmin:1/4,
    param:[
    {name:"Gain",def:70,max:100},
    {name:"Tube",def:30,max:100},
    {name:"Level",def:99,max:150},
    {name:"Trebl",def:52,max:100},
    {name:"Middl",def:50,max:100},
    {name:"Bass",def:45,max:100},
    {name:"Prese",def:50,max:100},
    {name:"CAB",def:192,max:gampcabmax,disp:gampcabdisp},
    {name:"OUT",def:0,max:4,disp:["LINE","COMBO FRONT","STACK FRONT","COMBO POWER AMP","STACK POWER AMP",]}]},
  0x40200108:{name:"B-BREAKER",group:"AMP",order:414,install:0,ver:0x0003,title:"Marshall 1962 Bluesbreaker modeling",
    dsp:2.3404,dspmax:41/100,dspmin:547/1500,
    param:[
    {name:"Gain",def:61,max:100},
    {name:"Tube",def:31,max:100},
    {name:"Level",def:100,max:150},
    {name:"Trebl",def:50,max:100},
    {name:"Middl",def:50,max:100},
    {name:"Bass",def:52,max:100},
    {name:"Prese",def:51,max:100},
    {name:"CAB",def:208,max:gampcabmax,disp:gampcabdisp},
    {name:"OUT",def:0,max:4,disp:["LINE","COMBO FRONT","STACK FRONT","COMBO POWER AMP","STACK POWER AMP",]}]},
  0x40400108:{name:"MS CRUNCH",group:"AMP",order:415,install:0,ver:0x0003,title:"Marshall 1959 crunch sound modeling",
    dsp:3.1102,dspmax:1/3,dspmin:1/4,
    param:[
    {name:"Gain",def:72,max:100},
    {name:"Tube",def:30,max:100},
    {name:"Level",def:98,max:150},
    {name:"Trebl",def:46,max:100},
    {name:"Middl",def:50,max:100},
    {name:"Bass",def:53,max:100},
    {name:"Prese",def:54,max:100},
    {name:"CAB",def:224,max:gampcabmax,disp:gampcabdisp},
    {name:"OUT",def:0,max:4,disp:["LINE","COMBO FRONT","STACK FRONT","COMBO POWER AMP","STACK POWER AMP",]}]},
  0x40600108:{name:"MS 1959",group:"AMP",order:416,install:0,ver:0x0001,title:"Marshall 1959 Plexi ('69)",
    dsp:2.3404,dspmax:41/100,dspmin:547/1500,
    param:[
    {name:"Gain",def:58,max:100},
    {name:"Tube",def:30,max:100},
    {name:"Level",def:100,max:150},
    {name:"Trebl",def:50,max:100},
    {name:"Middl",def:50,max:100},
    {name:"Bass",def:50,max:100},
    {name:"Prese",def:50,max:100},
    {name:"CAB",def:240,max:gampcabmax,disp:gampcabdisp},
    {name:"OUT",def:0,max:4,disp:["LINE","COMBO FRONT","STACK FRONT","COMBO POWER AMP","STACK POWER AMP",]}]},
  0x00000208:{name:"MS DRIVE",group:"AMP",order:417,install:0,ver:0x0003,title:"Marshall JCM2000 high gain sound modeling",
    dsp:3.1102,dspmax:1/3,dspmin:1/4,
    param:[
    {name:"Gain",def:82,max:100},
    {name:"Tube",def:30,max:100},
    {name:"Level",def:103,max:150},
    {name:"Trebl",def:45,max:100},
    {name:"Middl",def:50,max:100},
    {name:"Bass",def:56,max:100},
    {name:"Prese",def:53,max:100},
    {name:"CAB",def:256,max:gampcabmax,disp:gampcabdisp},
    {name:"OUT",def:0,max:4,disp:["LINE","COMBO FRONT","STACK FRONT","COMBO POWER AMP","STACK POWER AMP",]}]},
  0x00200208:{name:"BGN DRIVE",group:"AMP",order:418,install:0,ver:0x0003,title:"Bogner Ecstasy lead sound modeling",
    dsp:2.3404,dspmax:41/100,dspmin:547/1500,
    param:[
    {name:"Gain",def:84,max:100},
    {name:"Tube",def:30,max:100},
    {name:"Level",def:91,max:150},
    {name:"Trebl",def:52,max:100},
    {name:"Middl",def:50,max:100},
    {name:"Bass",def:49,max:100},
    {name:"Prese",def:50,max:100},
    {name:"CAB",def:272,max:gampcabmax,disp:gampcabdisp},
    {name:"OUT",def:0,max:4,disp:["LINE","COMBO FRONT","STACK FRONT","COMBO POWER AMP","STACK POWER AMP",]}]},
  0x00400208:{name:"BG DRIVE",group:"AMP",order:419,install:0,ver:0x0003,title:"Mesa Boogie Dual Rectifier red channel modeling",
    dsp:3.1102,dspmax:1/3,dspmin:1/4,
    param:[
    {name:"Gain",def:47,max:100},
    {name:"Tube",def:30,max:100},
    {name:"Level",def:97,max:150},
    {name:"Trebl",def:48,max:100},
    {name:"Middl",def:50,max:100},
    {name:"Bass",def:52,max:100},
    {name:"Prese",def:48,max:100},
    {name:"CAB",def:288,max:gampcabmax,disp:gampcabdisp},
    {name:"OUT",def:0,max:4,disp:["LINE","COMBO FRONT","STACK FRONT","COMBO POWER AMP","STACK POWER AMP",]}]},
  0x00600208:{name:"DZ DRIVE",group:"AMP",order:420,install:0,ver:0x0001,title:"High gain sound of Diezel Herbert",
    dsp:3.1102,dspmax:1/3,dspmin:1/4,
    param:[
    {name:"Gain",def:45,max:100},
    {name:"Tube",def:30,max:100},
    {name:"Level",def:93,max:150},
    {name:"Trebl",def:53,max:100},
    {name:"Middl",def:47,max:100},
    {name:"Bass",def:51,max:100},
    {name:"Prese",def:55,max:100},
    {name:"CAB",def:304,max:gampcabmax,disp:gampcabdisp},
    {name:"OUT",def:0,max:4,disp:["LINE","COMBO FRONT","STACK FRONT","COMBO POWER AMP","STACK POWER AMP",]}]},
  0x40000208:{name:"ALIEN",group:"AMP",order:421,install:0,ver:0x0001,title:"Engl Invader modeling",
    dsp:2.3404,dspmax:41/100,dspmin:547/1500,
    param:[
    {name:"Gain",def:62,max:100},
    {name:"Tube",def:30,max:100},
    {name:"Level",def:87,max:150},
    {name:"Trebl",def:52,max:100},
    {name:"Middl",def:50,max:100},
    {name:"Bass",def:44,max:100},
    {name:"Prese",def:54,max:100},
    {name:"CAB",def:320,max:gampcabmax,disp:gampcabdisp},
    {name:"OUT",def:0,max:4,disp:["LINE","COMBO FRONT","STACK FRONT","COMBO POWER AMP","STACK POWER AMP",]}]},
  0x40200208:{name:"REVO-1",group:"AMP",order:422,install:0,ver:0x0003,title:"Krank Revolution 1 Plus modeling",
    dsp:2.3404,dspmax:41/100,dspmin:547/1500,
    param:[
    {name:"Gain",def:64,max:100},
    {name:"Tube",def:30,max:100},
    {name:"Level",def:89,max:150},
    {name:"Trebl",def:50,max:100},
    {name:"Middl",def:50,max:100},
    {name:"Bass",def:51,max:100},
    {name:"Prese",def:51,max:100},
    {name:"CAB",def:336,max:gampcabmax,disp:gampcabdisp},
    {name:"OUT",def:0,max:4,disp:["LINE","COMBO FRONT","STACK FRONT","COMBO POWER AMP","STACK POWER AMP",]}]},
  0x0010000c:{name:"Tremolo",group:"MOD",order:500,install:0,ver:0x0211,title:"Volume varieing effect",
    dsp:14.2628,dspmax:1/12,dspmin:2/25,
    param:[
    {name:"Depth",def:80,max:100},
    {name:"Rate",def:33,max:78},
    {name:"Level",def:130,max:150},
    {name:"Wave",def:21,max:29,disp:["UP 0","UP 1","UP 2","UP 3","UP 4","UP 5","UP 6","UP 7","UP 8","UP 9",
      "DWN 0","DWN 1","DWN 2","DWN 3","DWN 4","DWN 5","DWN 6","DWN 7","DWN 8","DWN 9",
      "TRI 0","TRI 1","TRI 2","TRI 3","TRI 4","TRI 5","TRI 6","TRI 7","TRI 8","TRI 9"]}]},
  0x0020000c:{name:"DuoTrem",group:"MOD",order:501,install:0,ver:0x0123,title:"Combines two tremolos",
    dsp:12.7757,dspmax:1/12,dspmin:1/20,
    param:[
    {name:"RateA",def:46,max:78},
    {name:"RateB",def:5,max:78},
    {name:"Level",def:100,max:150},
    {name:"DPT_A",def:80,max:100},
    {name:"DPT_B",def:90,max:100},
    {name:"Link",def:0,max:2,disp:["Seri","Para","STR"]},
    {name:"WaveA",def:19,max:29,disp:["UP 0","UP 1","UP 2","UP 3","UP 4","UP 5","UP 6","UP 7","UP 8","UP 9",
      "DWN 0","DWN 1","DWN 2","DWN 3","DWN 4","DWN 5","DWN 6","DWN 7","DWN 8","DWN 9",
      "TRI 0","TRI 1","TRI 2","TRI 3","TRI 4","TRI 5","TRI 6","TRI 7","TRI 8","TRI 9"]},
    {name:"WaveB",def:21,max:29,disp:["UP 0","UP 1","UP 2","UP 3","UP 4","UP 5","UP 6","UP 7","UP 8","UP 9",
      "DWN 0","DWN 1","DWN 2","DWN 3","DWN 4","DWN 5","DWN 6","DWN 7","DWN 8","DWN 9",
      "TRI 0","TRI 1","TRI 2","TRI 3","TRI 4","TRI 5","TRI 6","TRI 7","TRI 8","TRI 9"]},
  ]},
  0x0040000c:{name:"Slicer",group:"MOD",order:502,install:0,ver:0x0202,title:"Rhythmical sounds by slicing",
    dsp:12.4737,dspmax:1/10,dspmin:1/20,
    param:[
    {name:"PTTRN",def:0,max:19,disp:1},
    {name:"Speed",def:24,max:77,disp:1},
    {name:"Bal",def:100,max:100},
    {name:"THRSH",def:20,max:50},
    {name:"Level",def:130,max:150},
  ]},
  0x0060000c:{name:"Phaser",group:"MOD",order:503,install:0,ver:0x0111,title:"Phase varieing effect",
    dsp:14.2628,dspmax:1/12,dspmin:1/20,
    param:[
    {name:"Rate",def:11,max:77,disp:1},
    {name:"Color",def:3,max:3,disp:["4 STG","8 STG","inv 4","inv 8"]},
    {name:"Level",def:100,max:150},
  ]},
  0x006a000c:{name:"DuoPhase",group:"MOD",order:504,install:0,ver:0x0221,title:"Combines 2 phasers",
    dsp:9.4118,dspmax:1/10,dspmin:1/15,
    param:[
    {name:"RateA",def:46,max:77,disp:1},
    {name:"RateB",def:5,max:51,disp:1},
    {name:"Level",def:100,max:150},
    {name:"ResoA",def:0,max:10},
    {name:"ResoB",def:6,max:10},
    {name:"Link",def:0,max:2,disp:["Seri","Para","STR"]},
    {name:"DPT_A",def:36,max:99,disp:1},
    {name:"DPT_B",def:62,max:99,disp:1},
  ]},
  0x0074000c:{name:"WarpPhase",group:"MOD",order:505,install:0,ver:0x0222,title:"Phaser with one way effect",
    dsp:9.4118,dspmax:1/10,dspmin:1/20,
    param:[
    {name:"Speed",def:24,max:77,disp:1},
    {name:"Reso",def:7,max:10},
    {name:"Level",def:100,max:150},
    {name:"DRCTN",def:0,max:1,disp:["Go","Back"]},
  ]},
  0x4000000c:{name:"TheVibe",group:"MOD",order:506,install:0,ver:0x0121,title:"Unique undulations vibe",
    dsp:9.4118,dspmax:1/10,dspmin:1/15,
    param:[
    {name:"Speed",def:25,max:50},
    {name:"Depth",def:60,max:100},
    {name:"Bias",def:48,max:100},
    {name:"Wave",def:24,max:100},
    {name:"Mode",def:1,max:1,disp:["VIBRT","CHORS"]},
    {name:"Level",def:100,max:150},
  ]},
  0x4060000c:{name:"Chorus",group:"MOD",order:507,install:0,ver:0x0101,title:"Mixing shifted pitch effect",
    dsp:12.4737,dspmax:1/10,dspmin:1/12,
    param:[
    {name:"Depth",def:40,max:100},
    {name:"Rate",def:24,max:49,disp:1},
    {name:"Mix",def:50,max:100},
    {name:"Tone",def:7,max:10},
    {name:"Level",def:100,max:150},
  ]},
  0x0000010c:{name:"Detune",group:"MOD",order:508,install:0,ver:0x0101,title:"Chorus without modulation by slightly pitch-shifted mix",
    dsp:14.2628,dspmax:1/12,dspmin:2/25,
    param:[
    {name:"Cent",def:35,max:50,disp:-25},
    {name:"PreD",def:0,max:50},
    {name:"Mix",def:52,max:100},
    {name:"Tone",def:8,max:10},
    {name:"Level",def:100,max:150},
  ]},
  0x0020010c:{name:"VintageCE",group:"MOD",order:509,install:0,ver:0x0122,title:"BOSS CE-1 modeling",
    dsp:10.9091,dspmax:1/10,dspmin:1/20,
    param:[
    {name:"Comp",def:2,max:9},
    {name:"Rate",def:24,max:49,disp:1},
    {name:"Mix",def:50,max:100},
    {name:"Level",def:100,max:150},
  ]},
  0x0040010c:{name:"StereoCho",group:"MOD",order:510,install:0,ver:0x0121,title:"Stereo chorus",
    dsp:12.4737,dspmax:1/10,dspmin:1/20,
    param:[
    {name:"Depth",def:80,max:100},
    {name:"Rate",def:29,max:49,disp:1},
    {name:"Mix",def:60,max:100},
    {name:"Tone",def:7,max:10},
    {name:"Level",def:100,max:150},
  ]},
  0x0060010c:{name:"Ensemble",group:"MOD",order:511,install:0,ver:0x0102,title:"Chorus with 3D movement",
    dsp:12.4737,dspmax:1/10,dspmin:1/20,
    param:[
    {name:"Depth",def:40,max:100},
    {name:"Rate",def:29,max:49,disp:1},
    {name:"Mix",def:60,max:100},
    {name:"Tone",def:8,max:10},
    {name:"Level",def:100,max:150},
  ]},
  0x4020010c:{name:"SuperCho",group:"MOD",order:512,install:0,ver:0x0121,title:"BOSS CH-1 SUPER CHORUS modeling",
    dsp:12.4737,dspmax:1/10,dspmin:1/20,
    param:[
    {name:"E.LVL",def:50,max:120},
    {name:"Rate",def:50,max:100},
    {name:"Depth",def:50,max:100},
    {name:"EQ",def:50,max:100},
    {name:"Mode",def:0,max:1,disp:["MONO","STR"]},
  ]},
  0x4030010c:{name:"VinFLNGR",group:"MOD",order:513,install:0,ver:0x0222,title:"MXR M-117R like analog flanger",
    dsp:12.4737,dspmax:1/12,dspmin:1/20,
    param:[
    {name:"Depth",def:47,max:100},
    {name:"Rate",def:7,max:78},
    {name:"Reso",def:18,max:20,disp:-10},
    {name:"PreD",def:4,max:50},
    {name:"Mix",def:65,max:100},
    {name:"Level",def:100,max:150},
  ]},
  0x4040010c:{name:"Flanger",group:"MOD",order:514,install:0,ver:0x0101,title:"ADA flanger like jet sound",
    dsp:12.4737,dspmax:1/10,dspmin:1/20,
    param:[
    {name:"Depth",def:47,max:100},
    {name:"Rate",def:7,max:78},
    {name:"Reso",def:18,max:20,disp:-10},
    {name:"PreD",def:4,max:50},
    {name:"Mix",def:65,max:100},
    {name:"Level",def:100,max:150},
  ]},
  0x4060010c:{name:"DynaFLNGR",group:"MOD",order:515,install:0,ver:0x0222,title:"Flanger with effect changes according to input level",
    dsp:9.4118,dspmax:1/10,dspmin:1/15,
    param:[
    {name:"Depth",def:30,max:100},
    {name:"Rate",def:38,max:78},
    {name:"Sense",def:0,max:19,disp:["-10","-9","-8","-7","-6","-5","-4","-3","-2","-1","1","2","3","4","5","6","7","8","9","10"]},
    {name:"Reso",def:15,max:20,disp:-10},
    {name:"Level",def:100,max:150},
  ]},
  0x0000020c:{name:"Vibrato",group:"MOD",order:516,install:0,ver:0x0121,title:"Automatic vibrato",
    dsp:12.4737,dspmax:1/10,dspmin:1/20,
    param:[
    {name:"Depth",def:40,max:100},
    {name:"Rate",def:30,max:78},
    {name:"Bal",def:72,max:100},
    {name:"Tone",def:7,max:10},
    {name:"Level",def:120,max:150},
  ]},
  0x0020020c:{name:"Octave",group:"MOD",order:517,install:0,ver:0x0201,title:"Adding one/two octave below sound",
    dsp:12.4737,dspmax:1/10,dspmin:1/20,
    param:[
    {name:"Oct1",def:80,max:100},
    {name:"Oct2",def:15,max:100},
    {name:"Dry",def:100,max:100},
    {name:"Chara",def:100,max:100},
    {name:"Tone",def:8,max:10},
    {name:"Level",def:100,max:150},
  ]},
  0x0040020c:{name:"PitchSHFT",group:"MOD",order:518,install:0,ver:0x0111,title:"Pitch shift up or down",
    dsp:14.2628,dspmax:1/12,dspmin:1/20,
    param:[
    {name:"Shift",def:19,max:25,disp:["-12","-11","-10","-9","-8","-7","-6","-5","-4","-3","-2","-1","0","1","2","3","4","5","6","7","8","9","10","11","12","24"]},
    {name:"Tone",def:7,max:10},
    {name:"Bal",def:40,max:100},
    {name:"Fine",def:25,max:50,disp:-25},
    {name:"Level",def:100,max:150},
  ]},
  0x0060020c:{name:"MonoPitch",group:"MOD",order:519,install:0,ver:0x0201,title:"Sound variance pitch shifter for monophonic",
    dsp:12.4737,dspmax:1/10,dspmin:1/20,
    param:[
    {name:"Shift",def:0,max:25,disp:-12},
    {name:"Tone",def:6,max:10},
    {name:"Bal",def:50,max:100},
    {name:"Fine",def:25,max:50,disp:-25},
    {name:"Level",def:100,max:150},
  ]},
  0x4000020c:{name:"HPS",group:"MOD",order:520,install:0,ver:0x0101,title:"Intelligent pitch shifter according to scale/key",
    dsp:12.4737,dspmax:1/10,dspmin:1/20,
    param:[
    {name:"Scale",def:6,max:9,disp:["-6","-5","-4","-3","-m","m","3","4","5","6"]},
    {name:"Key",def:0,max:11,disp:["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]},
    {name:"Mix",def:70,max:100},
    {name:"Tone",def:6,max:10},
    {name:"Level",def:100,max:150},
  ]},
  0x4020020c:{name:"BendCho",group:"MOD",order:521,install:0,ver:0x0202,title:"Pitch bending each input note",
    dsp:12.4737,dspmax:1/10,dspmin:1/20,
    param:[
    {name:"Depth",def:40,max:100},
    {name:"Time",def:50,max:50},
    {name:"Bal",def:100,max:100},
    {name:"Mode",def:0,max:1,disp:["Up","Down"]},
    {name:"Tone",def:8,max:10},
    {name:"Level",def:100,max:150},
  ]},
  0x4040020c:{name:"MojoRolle",group:"MOD",order:522,install:0,ver:0x0202,title:"Pitch modulation after picking",
    dsp:9.4118,dspmax:1/10,dspmin:1/15,
    param:[
    {name:"Depth",def:37,max:100},
    {name:"Speed",def:57,max:128},
    {name:"Rise",def:0,max:100},
    {name:"Mode",def:0,max:2,disp:["Up-Dn","Up","Down"]},
    {name:"Level",def:100,max:150},
  ]},
  0x4060020c:{name:"RingMod",group:"MOD",order:523,install:0,ver:0x0222,title:"Metallic ringing sound",
    dsp:14.2628,dspmax:1/12,dspmin:1/20,
    param:[
    {name:"Freq",def:27,max:49,disp:1},
    {name:"Tone",def:10,max:10},
    {name:"Bal",def:50,max:100},
    {name:"Level",def:120,max:150},
  ]},
  0x0000030c:{name:"CE-Cho5",group:"MOD",order:524,install:0,ver:0x0123,title:"BOSS CE-5 chorus modeling",
    dsp:10.1887,dspmax:1/10,dspmin:1/20,
    param:[
    {name:"E.LVL",def:100,max:120},
    {name:"RATE",def:31,max:100},
    {name:"DEPTH",def:67,max:100},
    {name:"LOW",def:43,max:100},
    {name:"HIGH",def:50,max:100},
    {name:"MODE",def:0,max:1,disp:["MONO","STR"]},
  ]},
  0x0020030c:{name:"CloneCho",group:"MOD",order:525,install:0,ver:0x0123,title:"Electro-Harmonix SmallClone chorus modeling",
    dsp:9.4118,dspmax:1/10,dspmin:1/15,
    param:[
    {name:"DEPTH",def:1,max:1,disp:["1","2"]},
    {name:"RATE",def:23,max:100},
  ]},
  0x0040030c:{name:"StonePha",group:"MOD",order:526,install:0,ver:0x0223,title:"Electro-Harmonix SmallStone phaser modeling",
    dsp:10.3226,dspmax:1/10,dspmin:1/20,
    param:[
    {name:"COLOR",def:0,max:1,disp:["1","2"]},
    {name:"RATE",def:50,max:100},
  ]},
  0x0060030c:{name:"BF FLG 2",group:"MOD",order:527,install:0,ver:0x0223,title:"BOSS BF-2 Flanger modeling",
    dsp:9.4118,dspmax:1/10,dspmin:1/15,
    param:[
    {name:"MNL",def:100,max:100},
    {name:"DEPTH",def:80,max:100},
    {name:"RATE",def:30,max:100},
    {name:"RES",def:50,max:100},
  ]},
  0x4000030c:{name:"SilkyCho",group:"MOD",order:528,install:0,ver:0x0103,title:"2 bands detune and chorus",
    dsp:5.4545,dspmax:1/5,dspmin:1/6,
    param:[
    {name:"LoMix",def:38,max:100},
    {name:"HiMix",def:100,max:100},
    {name:"ChMix",def:50,max:100},
    {name:"LoPit",def:31,max:50,disp:-25},
    {name:"HiPit",def:33,max:50,disp:-25},
    {name:"PreD",def:27,max:50},
    {name:"Rate",def:50,max:100},
    {name:"Depth",def:46,max:100},
    {name:"Tone",def:50,max:100},
  ]},
  0x4020030c:{name:"MirageCho",group:"MOD",order:529,install:0,ver:0x0103,title:"Chorus like mirage",
    dsp:9.4737,dspmax:1/10,dspmin:1/20,
    param:[
    {name:"Depth",def:60,max:100},
    {name:"Rate",def:38,max:100},
    {name:"Mix",def:55,max:100},
    {name:"PreD",def:10,max:19,disp:1},
    {name:"Tone",def:50,max:100},
    {name:"Level",def:100,max:150},
  ]},
  0x4040030c:{name:"CoronaCho",group:"MOD",order:530,install:0,ver:0x0123,title:"tc electronic CORONA CHORUS modeling",
    dsp:5.4545,dspmax:23/125,dspmin:1094/6000,
    param:[
    {name:"SPEED",def:50,max:100},
    {name:"DEPTH",def:50,max:100},
    {name:"FxLVL",def:65,max:100},
    {name:"TONE",def:75,max:100},
    {name:"DRY",def:1,max:1,disp:["OFF","ON"]},
  ]},
  0x4060030c:{name:"ANA234Cho",group:"MOD",order:531,install:0,ver:0x0123,title:"MXR M234 analog chorus modeling",
    dsp:7.2000,dspmax:1/6,dspmin:16/100,
    param:[
    {name:"LEVEL",def:70,max:100},
    {name:"RATE",def:60,max:100},
    {name:"DEPTH",def:50,max:100},
    {name:"LOW",def:100,max:100},
    {name:"HIGH",def:50,max:100},
    {name:"Mode",def:0,max:1,disp:["MONO","STR"]},
  ]},
  0x0000040c:{name:"CoronaTri",group:"MOD",order:532,install:0,ver:0x0123,title:"tc electonic CORONA Tri-Chorus modeling",
    dsp:3.6923,dspmax:1/3,dspmin:1/4,
    param:[
    {name:"SPEED",def:25,max:100},
    {name:"DEPTH",def:100,max:100},
    {name:"FxLVL",def:100,max:100},
    {name:"TONE",def:100,max:100},
    {name:"DRY",def:1,max:1,disp:["OFF","ON"]},
  ]},
  0x0020000e:{name:"BitCrush",group:"SFX",order:600,install:0,ver:0x0222,title:"Lo-Fi effect",
    dsp:14.2628,dspmax:1/12,dspmin:1/20,
    param:[
    {name:"Bit",def:5,max:12,disp:4},
    {name:"SMPL",def:2,max:50},
    {name:"Bal",def:90,max:100},
    {name:"Tone",def:8,max:10},
    {name:"Level",def:100,max:150},
  ]},
  0x0040000e:{name:"Bomber",group:"SFX",order:601,install:0,ver:0x0222,title:"Explosive sound effect",
    dsp:10.7911,dspmax:1/10,dspmin:1/20,
    param:[
    {name:"PTTRN",def:3,max:3,disp:["HndGn","Arm","Bomb","Thndr"]},
    {name:"Deay",def:49,max:99,disp:1},
    {name:"Bal",def:15,max:100},
    {name:"THRSH",def:40,max:50},
    {name:"Power",def:30,max:30},
    {name:"Tone",def:4,max:10},
    {name:"Level",def:100,max:150},
  ]},
  0x0060000e:{name:"MonoSynth",group:"SFX",order:602,install:0,ver:0x0202,title:"Monophonic guitar synth effect",
    dsp:12.4737,dspmax:1/10,dspmin:1/20,
    param:[
    {name:"Synth",def:40,max:100},
    {name:"Dry",def:100,max:100},
    {name:"Level",def:100,max:150},
    {name:"Wave",def:2,max:3,disp:["Sine","Tri","SawUp","SawDn"]},
    {name:"Tone",def:8,max:10},
    {name:"Speed",def:0,max:100},
  ]},
  0x4000000e:{name:"Z-Organ",group:"SFX",order:603,install:0,ver:0x0222,title:"Organ sound effect",
    dsp:7.2000,dspmax:1/6,dspmin:16/100,
    param:[
    {name:"Upper",def:70,max:100},
    {name:"Lower",def:80,max:100},
    {name:"Dry",def:80,max:100},
    {name:"HPF",def:3,max:10},
    {name:"LPF",def:8,max:10},
    {name:"Level",def:100,max:150},
  ]},
  0x4020000e:{name:"AutoPan",group:"SFX",order:604,install:0,ver:0x0122,title:"Cyclic panning position movement",
    dsp:14.2628,dspmax:1/12,dspmin:2/25,
    param:[
    {name:"Rate",def:5,max:78},
    {name:"Width",def:100,max:100,disp:-50},
    {name:"Level",def:100,max:150},
    {name:"Depth",def:7,max:10},
    {name:"Clip",def:0,max:10},
  ]},
  0x4040000e:{name:"Rt Closet",group:"SFX",order:605,install:0,ver:0x0122,title:"Rotary speaker simulation",
    dsp:4.4444,dspmax:1/4,dspmin:1/5,
    param:[
    {name:"Bal",def:50,max:100},
    {name:"Mode",def:0,max:1,disp:["Slow","Fast"]},
    {name:"Level",def:100,max:150},
    {name:"Drive",def:20,max:100},
  ]},
  0x00100010:{name:"Delay",group:"DELAY",order:700,install:0,ver:0x0111,title:"Long delay upto 4000ms",
    dsp:14.2628,dspmax:1/12,dspmin:1/20,
    param:[
    {name:"Time",def:559,max:4022,disp:1},
    {name:"F.B",def:30,max:100},
    {name:"Mix",def:70,max:100},
    {name:"HiDMP",def:10,max:10},
    {name:"P-P",def:0,max:1,disp:["MONO","P-P"]},
    {name:"Level",def:100,max:150},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x00200010:{name:"TapeEcho",group:"DELAY",order:701,install:0,ver:0x0121,title:"Tape echo simulation",
    dsp:12.4737,dspmax:1/10,dspmin:1/20,
    param:[
    {name:"Time",def:559,max:2014,disp:1},
    {name:"F.B",def:64,max:100},
    {name:"Mix",def:56,max:100},
    {name:"HiDMP",def:5,max:10},
    {name:"Level",def:100,max:150},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x00400010:{name:"ModDelay",group:"DELAY",order:702,install:0,ver:0x0121,title:"Delay effect with modulation",
    dsp:12.4737,dspmax:1/10,dspmin:1/20,
    param:[
    {name:"Time",def:499,max:2014,disp:1},
    {name:"F.B",def:50,max:100},
    {name:"Mix",def:62,max:100},
    {name:"Rate",def:20,max:49,disp:1},
    {name:"Level",def:100,max:150},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x00600010:{name:"AnalogDly",group:"DELAY",order:703,install:0,ver:0x0121,title:"Analog delay simulation",
    dsp:14.2628,dspmax:1/12,dspmin:1/20,
    param:[
    {name:"Time",def:359,max:4022,disp:1},
    {name:"F.B",def:28,max:100},
    {name:"Mix",def:40,max:100},
    {name:"HiDMP",def:8,max:10},
    {name:"P-P",def:0,max:1,disp:["MONO","P-P"]},
    {name:"Level",def:100,max:150},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x40000010:{name:"ReverseDL",group:"DELAY",order:704,install:0,ver:0x0121,title:"Reverse delay upto 2000ms",
    dsp:14.2628,dspmax:1/12,dspmin:1/20,
    param:[
    {name:"Time",def:990,max:2005,disp:10},
    {name:"F.B",def:20,max:100},
    {name:"Bal",def:50,max:100},
    {name:"HiDMP",def:8,max:10},
    {name:"Level",def:100,max:150},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x40200010:{name:"MultiTapD",group:"DELAY",order:705,install:0,ver:0x0122,title:"Several delay sounds with different delay times",
    dsp:10.7911,dspmax:1/10,dspmin:1/15,
    param:[
    {name:"Time",def:2999,max:3018,disp:1},
    {name:"PTTRN",def:1,max:7,disp:1},
    {name:"Mix",def:20,max:100},
    {name:"Tone",def:10,max:10},
    {name:"Level",def:100,max:150},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x40400010:{name:"DynaDelay",group:"DELAY",order:706,install:0,ver:0x0122,title:"Delay with dynamics adjusting according to input level",
    dsp:10.7911,dspmax:1/10,dspmin:1/15,
    param:[
    {name:"Time",def:359,max:2014,disp:1},
    {name:"Sense",def:5,max:19,disp:["-10","-9","-8","-7","-6","-5","-4","-3","-2","-1","1","2","3","4","5","6","7","8","9","10"]},
    {name:"Mix",def:80,max:100},
    {name:"F.B",def:30,max:100},
    {name:"Level",def:100,max:150},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x40600010:{name:"FilterDly",group:"DELAY",order:707,install:0,ver:0x0122,title:"Delay effect with filter",
    dsp:10.7911,dspmax:1/10,dspmin:1/15,
    param:[
    {name:"Time",def:499,max:2014,disp:1},
    {name:"F.B",def:50,max:100},
    {name:"Mix",def:90,max:100},
    {name:"Rate",def:6,max:49,disp:1},
    {name:"Depth",def:100,max:100},
    {name:"Reso",def:8,max:10},
    {name:"Level",def:100,max:150},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x00000110:{name:"PitchDly",group:"DELAY",order:708,install:0,ver:0x0122,title:"Delay effect with pitch-shifting",
    dsp:7.5224,dspmax:1/6,dspmin:16/100,
    param:[
    {name:"Time",def:89,max:1999,disp:1},
    {name:"Pitch",def:21,max:30,disp:[
      "-12","-11","-10","-9","-8","-7","-6","-5","-4","-3","-2","-1",
      "-0.15","-0.10","-0.05","0","0.05","0.10","0.15",
      "1","2","3","4","5","6","7","8","9","10","11","12"
    ]},
    {name:"Mix",def:80,max:100},
    {name:"F.B",def:80,max:100},
    {name:"Tone",def:8,max:10},
    {name:"Level",def:100,max:150},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x00200110:{name:"StereoDly",group:"DELAY",order:709,install:0,ver:0x0122,title:"Stereo delay with L/R separate delay times",
    dsp:10.7911,dspmax:1/10,dspmin:1/15,
    param:[
    {name:"TimeL",def:164,max:2014,disp:1},
    {name:"TimeR",def:504,max:2014,disp:1},
    {name:"Mix",def:100,max:100},
    {name:"LchFB",def:55,max:100},
    {name:"RchFB",def:37,max:100},
    {name:"Level",def:100,max:150},
    {name:"LchLv",def:100,max:100},
    {name:"RchLv",def:100,max:100},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x00400110:{name:"PhaseDly",group:"DELAY",order:710,install:0,ver:0x0122,title:"Delay effect with phaser",
    dsp:8.0000,dspmax:1/6,dspmin:16/100,
    param:[
    {name:"Time",def:499,max:2014,disp:1},
    {name:"F.B",def:28,max:100},
    {name:"Mix",def:57,max:100},
    {name:"Rate",def:49,max:49,disp:1},
    {name:"Color",def:3,max:3,disp:["4 STG","8 STG","inv 4","inv 8"]},
    {name:"Level",def:100,max:150},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x00600110:{name:"TrgHldDly",group:"DELAY",order:711,install:0,ver:0x0102,title:"Delay effect with sample&hold by picking",
    dsp:12.4737,dspmax:1/10,dspmin:9/100,
    param:[
    {name:"Time",def:40,max:990,disp:10},
    {name:"Duty",def:75,max:75,disp:25},
    {name:"Mix",def:100,max:100},
    {name:"THRSH",def:20,max:30},
    {name:"Level",def:100,max:150},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x40000110:{name:"StompDly",group:"DELAY",order:712,install:0,ver:0x0111,title:"Stomp style Self-Oscillable delay",
    dsp:12.4737,dspmax:1/10,dspmin:1/20,
    param:[
    {name:"E.LVL",def:30,max:120},
    {name:"F.B",def:20,max:100},
    {name:"Time",def:359,max:599,disp:1},
    {name:"Sync",def:0,max:15,disp:["OFF","1/16","1/12","3/32","1/8","1/6","3/16","1/4","3/8","1/2","3/4","4/4","5/4","6/4","7/4","8/4"]},
    {name:"Mode",def:0,max:1,disp:["MONO","STR"]},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
    {name:"HiDMP",def:5,max:10},
  ]},
  0x40200110:{name:"TapeEcho3",group:"DELAY",order:713,install:0,ver:0x0123,title:"MAESTRO ECHOPLEX EP-3 tape echo modiling",
    dsp:5.4545,dspmax:23/125,dspmin:18/100,
    param:[
    {name:"F.B",def:20,max:100},
    {name:"MIX",def:50,max:100},
    {name:"TIME",def:350,max:990,disp:10},
    {name:"RecLv",def:50,max:100},
    {name:"SYNC",def:0,max:15,disp:["OFF","1/16","1/12","3/32","1/8","1/6","3/16","1/4","3/8","1/2","3/4","4/4","5/4","6/4","7/4","8/4"]},
    {name:"P-Amp",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x40400110:{name:"DualDigiD",group:"DELAY",order:714,install:0,ver:0x0123,title:"Eventide TimeFactor DigitalDelay like cobination of 2 delays",
    dsp:4.4444,dspmax:1/4,dspmin:22/100,
    param:[
    {name:"TimeA",def:500,max:2005},
    {name:"TimeB",def:375,max:2005},
    {name:"FdbkA",def:50,max:110},
    {name:"FdbkB",def:50,max:110},
    {name:"Depth",def:0,max:101},
    {name:"Speed",def:25,max:50},
    {name:"FLTR",def:100,max:200,disp:-100},
    {name:"DlyMx",def:25,max:100},
    {name:"Mix",def:50,max:100},
  ]},
  0x40600110:{name:"CarbonDly",group:"DELAY",order:715,install:0,ver:0x0123,title:"MXR Carbon Copy analog delay modeling",
    dsp:4.4444,dspmax:1/4,dspmin:11/48,
    param:[
    {name:"DELAY",def:387,max:562,disp:19},
    {name:"REGEN",def:47,max:100},
    {name:"MIX",def:69,max:100},
    {name:"MID",def:1,max:1,disp:["OFF","ON"]},
    {name:"WIDTH",def:31,max:50},
    {name:"SPEED",def:28,max:50},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
    {name:"Sync",def:0,max:15,disp:["OFF","1/16","1/12","3/32","1/8","1/6","3/16","1/4","3/8","1/2","3/4","4/4","5/4","6/4","7/4","8/4"]},
  ]},
  0x00000210:{name:"DriveEcho",group:"DELAY",order:716,install:0,ver:0x0123,title:"LINE6 M9 TubeEcho modeling",
    dsp:1.7651,dspmax:429/750,dspmin:69/125,//0.572 - 0.552
    param:[
    {name:"DRIVE",def:39,max:100},
    {name:"MIX",def:80,max:100},
    {name:"TIME",def:355,max:1985,disp:20},
    {name:"F.B",def:70,max:100},
    {name:"WOW",def:25,max:100},
    {name:"DRV",def:0,max:1,disp:["DRIV","THRU"]},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
    {name:"Mode",def:0,max:1,disp:["MONO","STR"]},
  ]},
  0x00200210:{name:"SlapBackD",group:"DELAY",order:717,install:0,ver:0x0123,title:"tc electonic FLASHBACK set for SLAP delay modeling",
    dsp:5.4545,dspmax:23/125,dspmin:18/100,  //0.184 - 0.18
    param:[
    {name:"TIME",def:98,max:300,disp:1},
    {name:"SubDv",def:0,max:2,disp:["1/4","3/16","P-P"]},
    {name:"F.B",def:29,max:100},
    {name:"FxLVL",def:40,max:100},
    {name:"DRY",def:1,max:1,disp:["OFF","ON"]},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
    {name:"Mode",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x00400210:{name:"SmoothDly",group:"DELAY",order:718,install:0,ver:0x0123,title:"BOSS DD-20 smooth mode delay modeling",
    dsp:2.8111,dspmax:4/10,dspmin:1/3,
    param:[
    {name:"TIME",def:322,max:3014,disp:1},
    {name:"F.B",def:39,max:100},
    {name:"E.LVL",def:49,max:100},
    {name:"TONE",def:83,max:100},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x00600210:{name:"LO-FI Dly",group:"DELAY",order:719,install:0,ver:0x0123,title:"Strymon TIMELINE LO-FI mode deley modeling",
    dsp:2.2588,dspmax:1/2,dspmin:9/20,
    param:[
    {name:"TIME",def:248,max:1913,disp:2},
    {name:"F.B",def:25,max:100},
    {name:"MIX",def:50,max:100},
    {name:"SMPL",def:5,max:14,disp:["1/128","1/64","1/32","1/24","1/12","1/10","1/9","1/8","1/7","1/6","1/5","1/4","1/3","1/2","1/1"]},
    {name:"BITS",def:10,max:20,disp:["4","4.5","5","5.5","6","6.5","7","7.5","8","9","10","11","12","13","14","15","16","18","20","24","32"]},
    {name:"BLEND",def:60,max:100},
    {name:"DAMP",def:0,max:10},
    {name:"FLT",def:2,max:8,disp:["OFF","1","2","3","4","5","6","7","8"]},
    {name:"VINYL",def:0,max:18,disp:["OFF","D:1","D:2","D:3","D:4","D:5","D:6","D:7","D:8","D:9","S:1","S:2","S:3","S:4","S:5","S:6","S:7","S:8","S:9"]},
  ]},
  0x40000210:{name:"SlwAtkDly",group:"DELAY",order:720,install:0,ver:0x0123,title:"LINE6 M9 Auto-Volume Echo delay modeling",
    dsp:4.3243,dspmax:1/4,dspmin:22/100,
    param:[
    {name:"TIME",def:489,max:1914,disp:1},
    {name:"F.B",def:71,max:100},
    {name:"MIX",def:64,max:100},
    {name:"DEPTH",def:77,max:100},
    {name:"SWELL",def:24,max:49,disp:1},
    {name:"Mode",def:0,max:1,disp:["MONO","STR"]},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x40200210:{name:"TremDelay",group:"DELAY",order:721,install:0,ver:0x0123,title:"Strymon TIMELINE trem mode delay modeling",
    dsp:1.9173,dspmax:3/5,dspmin:1/2,
    param:[
    {name:"TIME",def:300,max:1855,disp:60},
    {name:"F.B",def:70,max:100},
    {name:"MIX",def:60,max:100},
    {name:"LFO",def:0,max:4,disp:["TRI","SQR","SIN","RAMP","SAW"]},
    {name:"DEPTH",def:100,max:100},
    {name:"SPEED",def:19,max:34,disp:["1/32","1/24","1/18","1/16","1/12","1/10","1/9","1/8","1/7","1/6","1/5","1/4","1/3","1/2","2/3","3/4",
        "1/1","4/3","3/2","2/1","5/2","3/1","7/2","4/1","5/1","6/1","7/1","8/1","9/1","10/1","12/1","16/1","18/1","24/1","32/1"]},
    {name:"DAMP",def:4,max:10},
    {name:"HPF",def:4,max:20,disp:[
      "OFF","20","40","60","80","100","120","140","160","180","200","230","260","300","350","400","500","600","700","800","900"]},
    {name:"GRIT",def:2,max:10},
  ]},
  0x40400210:{name:"FLTR PPD",group:"DELAY",order:722,install:0,ver:0x0123,title:"Eventide TimeFactor FilterPong delay modeling",
    dsp:3.4286,dspmax:1/3,dspmin:1/4,
    param:[
    {name:"TimeA",def:500,max:1915},
    {name:"TimeB",def:250,max:1915},
    {name:"Mix",def:50,max:100},
    {name:"DlyMx",def:25,max:100},
    {name:"Fdbk",def:75,max:110},
    {name:"Slur",def:3,max:10},
    {name:"FLTR",def:80,max:100},
    {name:"Depth",def:8,max:21},
    {name:"Wave",def:35,max:47},
  ]},
  0x40600210:{name:"A-Pan DLY",group:"DELAY",order:723,install:0,ver:0x0123,title:"Combination of autopan and delay",
    dsp:5.8065,dspmax:924/5400,dspmin:1/6,//0.17111 - 0.1666
    param:[
    {name:"Time",def:222,max:2014,disp:1},
    {name:"F.B",def:87,max:100},
    {name:"Mix",def:53,max:100},
    {name:"Rate",def:26,max:52,disp:-2},
    {name:"Width",def:0,max:100,disp:-50},
    {name:"Depth",def:7,max:10},
    {name:"Clip",def:0,max:10},
    {name:"Link",def:1,max:1,disp:["P-D","D-P"]},
    {name:"Level",def:100,max:200},
  ]},
  0x00000310:{name:"ICE Delay",group:"DELAY",order:724,install:0,ver:0x0123,title:"Strymon TIMELINE ICE mode pitch shifting delay modeling",
    dsp:2.9268,dspmax:4/10,dspmin:1/3,
    param:[
    {name:"TIME",def:440,max:1255,disp:60},
    {name:"F.B",def:64,max:100},
    {name:"MIX",def:60,max:100},
    {name:"INTVL",def:23,max:30,disp:[
      "-Oct","-M7","-m7","-M6","-m6","-P5","-Tri","-P4","-M3","-m3","-M2","-m2","-50c","-25c","Uni",
      "+25c","+50c","+m2","+M2","+m3","+M3","+P4","+Tri","+P5","+m6","+M6","+m7","+M7","+Oct","Oc+5","2Oct"]},
    {name:"SLICE",def:1,max:1,disp:["SHORT","LONG"]},
    {name:"BLEND",def:12,max:20},
    {name:"SMEAR",def:7,max:20},
    {name:"DAMP",def:2,max:10},
    {name:"HPF",def:1,max:20,disp:[
      "OFF","20","40","60","80","100","120","140","160","180","200","230","260","300","350","400","500","600","700","800","900"]},
  ]},
  0x00100012:{name:"HD Hall",group:"REVERB",order:800,install:0,ver:0x0111,title:"Dense hall reverb",
    dsp:2.3356,dspmax:9/20,dspmin:3/8,
    param:[
    {name:"PreD",def:80,max:199,disp:1},
    {name:"Decay",def:45,max:100},
    {name:"Mix",def:62,max:100},
    {name:"LoDMP",def:32,max:100},
    {name:"HiDMP",def:70,max:100},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x00180012:{name:"HD Reverb",group:"REVERB",order:801,install:0,ver:0x0122,title:"High definition reverb",
    dsp:4.5272,dspmax:277/1200,dspmin:1/5,
    param:[
    {name:"Decay",def:10,max:100},
    {name:"Tone",def:7,max:10},
    {name:"Mix",def:46,max:100},
    {name:"PreD",def:53,max:199,disp:1},
    {name:"HPF",def:7,max:10},
    {name:"Level",def:100,max:150},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x00200012:{name:"Hall",group:"REVERB",order:802,install:0,ver:0x0121,title:"Concert hall simulation",
    dsp:8.7273,dspmax:1/10,dspmin:1/15,
    param:[
    {name:"Decay",def:9,max:29,disp:1},
    {name:"Tone",def:5,max:10},
    {name:"Mix",def:46,max:100},
    {name:"PreD",def:48,max:99,disp:1},
    {name:"Level",def:100,max:150},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x00400012:{name:"Room",group:"REVERB",order:803,install:0,ver:0x0111,title:"A room simulation",
    dsp:10.7911,dspmax:1/10,dspmin:1/15,
    param:[
    {name:"Decay",def:9,max:29,disp:1},
    {name:"Tone",def:8,max:10},
    {name:"Mix",def:60,max:100},
    {name:"PreD",def:4,max:99,disp:1},
    {name:"Level",def:100,max:150},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x00600012:{name:"TiledRoom",group:"REVERB",order:804,install:0,ver:0x0122,title:"Tiled room simulation",
    dsp:9.6000,dspmax:1/10,dspmin:1/15,
    param:[
    {name:"Decay",def:19,max:29,disp:1},
    {name:"Tone",def:4,max:10},
    {name:"Mix",def:46,max:100},
    {name:"PreD",def:9,max:99,disp:1},
    {name:"Level",def:100,max:150},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x40000012:{name:"Spring",group:"REVERB",order:805,install:0,ver:0x0121,title:"Spring reverb simulation",
    dsp:8.8933,dspmax:1/6,dspmin:1/15,
    param:[
    {name:"Decay",def:19,max:29,disp:1},
    {name:"Tone",def:8,max:10},
    {name:"Mix",def:50,max:100},
    {name:"PreD",def:0,max:99,disp:1},
    {name:"Level",def:100,max:150},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x40200012:{name:"Arena",group:"REVERB",order:806,install:0,ver:0x0122,title:"Sports arena like large enclosure simulation",
    dsp:10.7911,dspmax:1/10,dspmin:1/15,
    param:[
    {name:"Decay",def:14,max:29,disp:1},
    {name:"Tone",def:7,max:10},
    {name:"Mix",def:56,max:100},
    {name:"PreD",def:89,max:99,disp:1},
    {name:"Level",def:100,max:150},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x40400012:{name:"EarlyRef",group:"REVERB",order:807,install:0,ver:0x0122,title:"Only the early reflections of reverb",
    dsp:7.4071,dspmax:1/6,dspmin:16/100,
    param:[
    {name:"Decay",def:14,max:29,disp:1},
    {name:"Shape",def:20,max:20,disp:-10},
    {name:"Mix",def:50,max:100},
    {name:"Tone",def:6,max:10},
    {name:"Level",def:100,max:150},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x40600012:{name:"Air",group:"REVERB",order:808,install:0,ver:0x0122,title:"A room ambience with spatial depth",
    dsp:15.1257,dspmax:1/12,dspmin:2/25,
    param:[
    {name:"Size",def:19,max:99,disp:1},
    {name:"Tone",def:8,max:10},
    {name:"Mix",def:60,max:100},
    {name:"Ref",def:5,max:10},
    {name:"Level",def:100,max:150},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x00200112:{name:"Plate",group:"REVERB",order:809,install:0,ver:0x0113,title:"Plate reverb simulation",
    dsp:3.4565,dspmax:28/100,dspmin:10/36,
    param:[
    {name:"PreD",def:8,max:199,disp:1},
    {name:"Decay",def:52,max:100},
    {name:"Mix",def:44,max:100},
    {name:"Color",def:58,max:100},
    {name:"LoDMP",def:97,max:100},
    {name:"HiDMP",def:95,max:100},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
    {name:"Level",def:100,max:150},
  ]},
  0x00400112:{name:"ModReverb",group:"REVERB",order:810,install:0,ver:0x0113,title:"Fluctuating echoes",
    dsp:4.4893,dspmax:1/4,dspmin:1/5,
    param:[
    {name:"Depth",def:38,max:100},
    {name:"Decay",def:19,max:29,disp:1},
    {name:"Mix",def:45,max:100},
    {name:"Rate",def:19,max:49,disp:1},
    {name:"Tone",def:6,max:10},
    {name:"PreD",def:29,max:99,disp:1},
    {name:"Level",def:100,max:150},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x00600112:{name:"SlapBack",group:"REVERB",order:811,install:0,ver:0x0113,title:"Reverb with repeating echo",
    dsp:4.6142,dspmax:1108/4800,dspmin:1/5,
    param:[
    {name:"Time",def:379,max:1010,disp:1},
    {name:"Decay",def:9,max:29,disp:1},
    {name:"Mix",def:48,max:100},
    {name:"F.B",def:43,max:100},
    {name:"Tone",def:10,max:10},
    {name:"DRBal",def:70,max:100},
    {name:"Level",def:100,max:150},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x40000112:{name:"Spring63",group:"REVERB",order:812,install:0,ver:0x0123,title:"Fender Reverb ('63) spring reverb modeling",
    dsp:2.6737,dspmax:4/10,dspmin:1/3,
    param:[
    {name:"DWELL",def:35,max:100},
    {name:"MIXER",def:51,max:100},
    {name:"TONE",def:58,max:100},
    {name:"LEVEL",def:100,max:150},
  ]},
  0x40200112:{name:"Chamber",group:"REVERB",order:813,install:0,ver:0x0123,title:"Chamber room simulation",
    dsp:2.8535,dspmax:4/10,dspmin:1/3,
    param:[
    {name:"Decay",def:50,max:100},
    {name:"Tone",def:73,max:100},
    {name:"Mix",def:48,max:100},
    {name:"PreD",def:24,max:200},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x40400112:{name:"LOFI Rev",group:"REVERB",order:814,install:0,ver:0x0123,title:"tc electronic HALL OF FAME lofi setting modeling",
    dsp:2.3731,dspmax:9/20,dspmin:3/8,
    param:[
    {name:"DECAY",def:52,max:100},
    {name:"TONE",def:95,max:100},
    {name:"FxLVL",def:44,max:100},
    {name:"PreD",def:0,max:1,disp:["SHORT","LONG"]},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
    {name:"Dry",def:1,max:1,disp:["OFF","ON"]},
  ]},
  0x40600112:{name:"Church",group:"REVERB",order:815,install:0,ver:0x0123,title:"Reverbrations of a church simulation",
    dsp:2.4828,dspmax:5/12,dspmin:3/8,
    param:[
    {name:"DECAY",def:49,max:100},
    {name:"PreD",def:96,max:200},
    {name:"MIX",def:46,max:100},
    {name:"TONE",def:61,max:100},
    {name:"HiDMP",def:83,max:100},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
    {name:"Dry",def:1,max:1,disp:["OFF","ON"]},
  ]},
  0x00000212:{name:"Cave",group:"REVERB",order:816,install:0,ver:0x0123,title:"Reverbrations of a cave simulation",
    dsp:3.0968,dspmax:1/3, dspmin:1/4,
    param:[
    {name:"Decay",def:52,max:100},
    {name:"Tone",def:54,max:100},
    {name:"Mix",def:40,max:100},
    {name:"PreD",def:62,max:200},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x00200212:{name:"Ambience",group:"REVERB",order:817,install:0,ver:0x0123,title:"Natural ambience reverb",
    dsp:2.4175,dspmax:41/100,dspmin:7/18,
    param:[
    {name:"DECAY",def:70,max:100},
    {name:"TONE",def:80,max:100},
    {name:"MIX",def:50,max:100},
    {name:"PreD",def:29,max:200},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
    {name:"Dry",def:1,max:1,disp:["OFF","ON"]},
  ]},
  0x00400212:{name:"GateRev",group:"REVERB",order:818,install:0,ver:0x0123,title:"DigiTech RV-7(Lexicon) Gated setting modeling",
    dsp:2.7079,dspmax:4/10,dspmin:1/3,
    param:[
    {name:"Level",def:60,max:100},
    {name:"Tone",def:50,max:100},
    {name:"Decay",def:55,max:100},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
    {name:"Dry",def:1,max:1,disp:["OFF","ON"]},
  ]},
  0x00600212:{name:"ReverseRv",group:"REVERB",order:819,install:0,ver:0x0123,title:"DigiTech RV-7(Lexicon) Reverse setting modeling",
    dsp:3.4286,dspmax:28/100,dspmin:1/4,
    param:[
    {name:"Level",def:100,max:100},
    {name:"Tone",def:70,max:100},
    {name:"Decay",def:100,max:100},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
    {name:"Dry",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x40000212:{name:"Echo",group:"REVERB",order:820,install:0,ver:0x0123,title:"Gorgeous echoes",
    dsp:2.8805,dspmax:4/10,dspmin:1/3,
    param:[
    {name:"DECAY",def:25,max:100},
    {name:"TIME",def:125,max:200},
    {name:"TONE",def:70,max:100},
    {name:"MIX",def:80,max:100},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
    {name:"Mode",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x40200212:{name:"TremoloRv",group:"REVERB",order:821,install:0,ver:0x0123,title:"EvenTide SPACE tremolo verb like reverb",
    dsp:2.2236,dspmax:1/2,dspmin:3/8,
    param:[
    {name:"Decay",def:50,max:100},
    {name:"PDLY",def:70,max:500},
    {name:"Mix",def:45,max:100},
    {name:"Speed",def:28,max:346,disp:10},
    {name:"Shape",def:0,max:5,disp:["SINE","TRI","PEAK","RNDM","RAMP","SQR"]},
    {name:"Depth",def:199,max:200,disp:0},
    {name:"Size",def:50,max:100},
    {name:"Low",def:100,max:200,disp:-100},
    {name:"High",def:100,max:200,disp:-100},
  ]},
  0x40400212:{name:"HolyFLERB",group:"REVERB",order:822,install:0,ver:0x0123,title:"Electro-Harmonix Holy Grail FLERB reverb/flanger modeling",
    dsp:2.4242,dspmax:1/2,dspmin:3/8,
    param:[
    {name:"RVRB",def:50,max:100},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x40600212:{name:"DynaRev",group:"REVERB",order:823,install:0,ver:0x0123,title:"tc electronic NOVA REVERB dynamics changing reverb modeling",
    dsp:2.5714,dspmax:41/100,dspmin:3/8,
    param:[
    {name:"Decay",def:82,max:100},
    {name:"PreD",def:0,max:100},
    {name:"Color",def:76,max:100},
    {name:"Sense",def:172,max:200,disp:-100},
    {name:"Mix",def:40,max:100},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x00000312:{name:"ShimmerRv",group:"REVERB",order:824,install:0,ver:0x0103,title:"Strymon blueSky shimmer mode pitch-shifting delay/reverb modeling",
    dsp:1.8605,dspmax:3/5,dspmin:133/250,
    param:[
    {name:"PreD",def:39,max:99,disp:1},
    {name:"DECAY",def:90,max:100},
    {name:"MIX",def:50,max:100},
    {name:"LoDMP",def:50,max:100},
    {name:"HiDMP",def:74,max:100},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x00200312:{name:"ParticleR",group:"REVERB",order:825,install:0,ver:0x0103,title:"LINE6 M9 Particle Verb complex reverb modeling",
    dsp:1.7804,dspmax:3/5,dspmin:1/2,
    param:[
    {name:"DWELL",def:40,max:100},
    {name:"GAIN",def:100,max:100},
    {name:"MODE",def:0,max:2,disp:["STBL","CRTCL","HZD"]},
    {name:"MIX",def:60,max:100},
    {name:"MONO",def:0,max:1,disp:["OFF","ON"]},
    {name:"Tail",def:0,max:1,disp:["OFF","ON"]},
  ]},
  0x00400312:{name:"SpaceHole",group:"REVERB",order:826,install:0,ver:0x0103,title:"Eventide SPACE BlackHole delay/reverb modeling",
    dsp:2.2599,dspmax:19/40,dspmin:5/12,
    param:[
    {name:"Decay",def:50,max:200,disp:-100},
    {name:"PDLY",def:80,max:1000},
    {name:"Mix",def:40,max:100},
    {name:"F.B",def:45,max:100},
    {name:"Depth",def:58,max:100},
    {name:"Speed",def:39,max:100},
    {name:"Size",def:29,max:100},
    {name:"Low",def:87,max:200,disp:-100},
    {name:"High",def:82,max:200,disp:-100},
  ]},
  0x00600312:{name:"MangledSp",group:"REVERB",order:827,install:0,ver:0x0103,title:"Eventide SPACE MangledVerb like wild echoes",
    dsp:1.8983,dspmax:3/5,dspmin:1/2,
    param:[
    {name:"PDLY",def:80,max:500},
    {name:"Clip",def:50,max:100},
    {name:"Mix",def:38,max:100},
    {name:"Decay",def:50,max:100},
    {name:"Mod",def:50,max:100},
    {name:"Size",def:50,max:100},
    {name:"Low",def:97,max:200,disp:-100},
    {name:"High",def:101,max:200,disp:-100},
    {name:"Level",def:85,max:200},
  ]},
  0x40000312:{name:"DualRev",group:"REVERB",order:828,install:0,ver:0x0103,title:"Eventide SPACE DualVerb like Combination of two reverbs",
    dsp:2.1132,dspmax:1/2,dspmin:3/8,
    param:[
    {name:"PDlyA",def:350,max:750},
    {name:"PDlyB",def:700,max:750},
    {name:"Mix",def:30,max:100},
    {name:"ABMix",def:14,max:18,disp:[
      "A9B0","A9B1","A9B2","A9B3","A9B4","A9B5","A9B6","A9B7","A9B8","A9B9",
      "A8B9","A7B9","A6B9","A5B9","A4B9","A3B9","A2B9","A1B9","A0B9"]},
    {name:"DCY A",def:15,max:100},
    {name:"DCY B",def:30,max:100},
    {name:"Size",def:21,max:32,disp:[
      "A1B1","A2B1","A3B1","A4B1","A5B1","A6B1","A7B1","A8B1","A9B1",
      "A9B2","A9B3","A9B4","A9B5","A9B6","A9B7","A9B8","A9B9",
      "A8B9","A7B9","A6B9","A5B9","A4B9","A3B9","A2B9","A1B9",
      "A1B8","A1B7","A1B6","A1B5","A1B4","A1B3","A1B2","A1B1",
    ]},
    {name:"ToneA",def:100,max:200,disp:-100},
    {name:"ToneB",def:70,max:200,disp:-100},
  ]},
}
function dumpeff(){
  console.log("name,group,ms50g,ms60b,ms70cdr,dsp(%),description")
  for(i in effectlist){
    var ef=effectlist[i];
    var v50=ef.ver&0xf;
    var v60=(ef.ver>>4)&0xf;
    var v70=(ef.ver>>8)&0xf;
    console.log("\""+ef.name+"\","+ef.group+","+((v50>0)?v50:"")+","+((v60>0)?v60:"")+","+((v70>0)?v70:"")+","+(100/ef.dsp).toFixed(1)+","+ef.title);
  }
}
function MidiIf(ma){
  this.midiaccess=ma;
  this.midiout=null;
  this.devid=0x58;
  this.version=3;
  this.devstr="50g";
  this.sysexhead="f0520058";
  this.que=[];
  this.scan=-1;
  this.dump=1;
  this.supress=0;
  this.waitdata=null;
  this.callback=null;
  this.ready=0;
  this.pcnt=0;
  this.workpatch=new apatch();
  this.midiinport=null;
  this.midiaccess.onstatechange=function(ev){
    console.log("StateChange",ev)
  };
  this.instSet=function(){
    for(var id in effectlist){
      var v=effectlist[id].ver;
      switch(this.devid){
      case 0x58: v=v&0xf; break;
      case 0x5f: v=(v>>4)&0xf; break;
      case 0x61: v=(v>>8)&0xf; break;
      }
      var el=document.getElementById("e_"+id);
      if(el){
        if(v==0||v>this.version){
          effectlist[id].install=-2;
          document.getElementById("e_"+id).classList.add("notinstall");
        }
        else if(this.devid!=0x58){
          effectlist[id].install=1;
          document.getElementById("e_"+id).classList.add("install");
        }
      }
    }
  }
  this.recv=function(ev){
    if(abort)
      return;
    midirecv=MakeStr(ev.data);
    switch(this.dump){
    case 1:
      if(ev.data[0]>=0xf0)
        console.log(midirecv);
      break;
    case 2:
      console.log(midirecv);
      break;
    }
    if((!this.supress ||this.waitdata=="c0") && ev.data[0]==0xc0){
      if(currentpatch!=ev.data[1] && this.scan<0){
        SetPatchFocus(0);
        currentpatch=ev.data[1];
        DispPatch();
        SetPatchFocus(1);
      }
    }
    if(midirecv.indexOf(this.sysexhead+"31")==0){
      if(ev.data[6]==0)
        SetEffectState(currentpatch,ev.data[5],0);
      if(ev.data[6]>=2){
        var v=(ev.data[7]&0x7f)+((ev.data[8]&0x7f)<<7);
        SetParamVal(currentpatch,ev.data[5],ev.data[6],v);
        if(this.dump==3){
          console.log(ev.data[5],ev.data[6],v);
        }
        DispPatch();
      }
    }
    else if(midirecv.indexOf("f07e00060252")==0){
      var v=String.fromCharCode(ev.data[10],ev.data[11],ev.data[12],ev.data[13]);
      this.version=parseFloat(v);
      switch(this.devid=ev.data[6]){
      case 0x58:
        this.sysexhead="f0520058";
        this.devstr="50g";
        this.instSet();
        document.getElementById("device").innerHTML="MS-50G";
        document.getElementById("effects").rows[4].style.display="";
        document.getElementById("effects").rows[5].style.display="";
        for(var id in effectlist){
          var ef=effectlist[id];
          if(ef.group=="AMP" && (ef.ver&0xf)){
            ef.param[7].max=gampcab[(v>=3)?1:0].max;
            ef.param[7].disp=gampcab[(v>=3)?1:0].disp;
          }
        }
        break;
      case 0x5f:
        this.sysexhead="f052005f";
        this.devstr="60b";
        this.instSet();
        document.getElementById("device").innerHTML="MS-60B";
        document.getElementById("effects").rows[4].style.display="none";
        document.getElementById("effects").rows[5].style.display="none";
        for(var id in effectlist){
          var ef=effectlist[id];
          if(ef.group=="AMP" && (ef.ver&0xf0)){
            ef.param[7].max=bampcab[(v>=2)?1:0].max;
            ef.param[7].disp=bampcab[(v>=2)?1:0].disp;
          }
        }
        break;
      case 0x61:
        this.sysexhead="f0520061";
        this.devstr="70cdr";
        this.instSet();
        document.getElementById("device").innerHTML="MS-70CDR";
        document.getElementById("effects").rows[4].style.display="";
        document.getElementById("effects").rows[5].style.display="";
        break;
      }
      inst.ShowAll(false);
      document.getElementById("firmver").innerHTML=v;
    }
    else if(midirecv.indexOf(this.sysexhead+"28")==0){
      var name=MakeName(ev.data);
      if(this.scan>=0){
        document.getElementById("waitmsg").innerHTML="Scanning Patches...("+this.scan+"/50)";
        patches[this.scan].ReadBin(ev.data);
        DispPatchName(this.scan);
        for(var ii=0;ii<6;++ii){
          var id=patches[this.scan].GetEffectId(ii);
          if(id && effectlist[id]){
            effectlist[id].install=1;
            var el=document.getElementById("e_"+id);
            if(el) el.classList.add("install");
          }
        }
        ++this.scan;
        if(this.scan>49){
          this.scan=-1;
          this.ready=1;
          midiif.Send([0xc0,currentpatch]);
          SetPatchFocus(1);
          DispPatch();
          document.getElementById("waitbase").style.display="none";
          ready=true;
          for(i=0;i<6;++i){
            var cell=document.getElementById("fnam"+(i+1));
            var cell2=document.getElementById("fnum"+(i+1));
            cell.oncontextmenu=function(ev){
              currenteffect=parseInt(ev.target.id[4])-1;
              SetCurrentEffect(currenteffect);
              midiif.SendCurrentPatch();
              PopupEffectMenu(ev.target);
              ev.preventDefault();
            };
            cell.ondblclick=function(ev){
              document.getElementById("effectpanelmsg").innerHTML="Add / Replace Effect";
              document.getElementById("effectpanelbase").style.display="block";
            };
            cell.onclick=function(ev){
              currenteffect=parseInt(ev.target.id[4])-1;
              SetCurrentEffect(currenteffect);
              ToggleEffect(currenteffect);
              UpdateFocus();
              DispPatchName(currentpatch);
              ev.preventDefault();
            };
            cell2.onclick=cell2.oncontextmenu=function(ev){
              currenteffect=parseInt(ev.target.id[4])-1;
              PopupEffectMenu(ev.target);
              SetCurrentEffect(currenteffect);
              midiif.SendCurrentPatch();
              ev.stopPropagation();
              ev.preventDefault();
            };
          }
        }
        else{
          this.que.push([0xc0,this.scan]);
          this.que.push([0xf0,0x52,0,this.devid,0x29,0xf7]);
        }
      }
      else{
        patches[currentpatch].ReadBin(ev.data);
        for(var ii=0;ii<6;++ii){
          var id=patches[currentpatch].GetEffectId(ii);
          if(id && effectlist[id]){
            effectlist[id].install=1;
            var el=document.getElementById("e_"+id);
            if(el) el.classList.add("install");
          }
        }
        DispPatch();
        DispPatchName(currentpatch);
      }
    }
    if(this.waitdata){
      if(midirecv.indexOf(this.waitdata)==0){
        this.supress=0;
        this.waitdata=null;
        if(this.callback){
          this.callback(ev.data,midirecv);
        }
      }
    }
  };
  this.StartScan=function(){
    console.log("StartScan")
    if(!this.midiout)
      return;
    document.getElementById("waitmsg").innerHTML="";
    document.getElementById("waitbase").style.display="block";
    this.SendDirect([0xf0,0x7e,0x00,0x06,0x01,0xf7]);
    setTimeout(function(){
      this.SendDirect([0xf0,0x52,0x00,this.devid,0x50,0xf7]);
      this.scan=0;
      setTimeout(function(){
        this.SendWait([0xf0,0x52,0x00,this.devid,0x33,0xf7],"c0",function(dat){
          this.norg=currentpatch=dat[1];
          this.que.push([0xf0,0x52,0x00,this.devid,0x50,0xf7]);
          this.que.push([0xc0,this.scan]);
          this.que.push([0xf0,0x52,0,this.devid,0x29,0xf7]);
        }.bind(this));
      }.bind(this),100);
    }.bind(this),200);
  };
  this.SendDirect=function(d){
    if(this.dump==4)
      console.log("S:"+MakeStr(d));
    if(this.midiout)
      this.midiout.send(d);
  };
  this.Send=function(d){
    if(this.que.length>2){
      var d2=this.que[this.que.length-1];
      if(d[0]==0xf0 && d2[0]==0xf0){
        if(d[4]==0x28 && d2[4]==0x28){
          this.que.pop();
        }
        else if(d[4]==0x31 && d2[4]==0x31 && d[5]==d2[5] && d[6]==d2[6]){
          this.que.pop();
        }
      }
    }
    this.que.push(d);
  };
  this.RequestPatch=function(){
    this.Send([0xf0,0x52,0x00,this.devid,0x29,0xf7]);
//    this.SendWait([0xf0,0x52,0x00,this.devid,0x29,0xf7],this.sysexhead+"28",null);
  };
  this.SendParamChange=function(f,p,v){
    var cmd=[0xf0,0x52,0x00,this.devid,0x31,f,p,v&0x7f,(v>>7)&0x7f,0xf7];
    this.Send(cmd);
  };
  this.SendCurrentPatch=function(){
    this.Send(patches[currentpatch].MakeBin(this.devid));
  };
  this.SendCurrentPatchVerify=function(callback){
    var o=[];
    var len=(midiif.devid==0x5f)?4:6;
    for(var i=0;i<len;++i){
      o.push(patches[currentpatch].GetEffectId(i));
    }
    this.SendCurrentPatch();
    setTimeout(function(){
      this.SendWait([0xf0,0x52,0x00,this.devid,0x29,0xf7],this.sysexhead+"28",function(dat,str){
        var s="";
        this.workpatch.ReadBin(dat);
        for(var j=0;j<len;++j){
          if(o[j]!=patches[currentpatch].GetEffectId(j)){
            var el=document.getElementById("e_"+o[j]);
            if(el){
              el.classList.add("notinstall");
              if(effectlist[o[j]].install==0)
                effectlist[o[j]].install=-1;
              s+="["+effectlist[o[j]].name+"]";
            }
          }
        }
        if(callback)
          callback(s.length?s:null);
      })
    }.bind(this),200);
  };
  this.SendWait=function(sd,rv,cb){
    this.supress=1;
    this.callback=cb;
    this.waitdata=rv;
    this.SendDirect(sd);
  };
  this.timer=function(){
    if(abort)
      return;
    var id=0;
    var cookies=document.cookie.split(";");
    for(var i=0;i<cookies.length;++i){
      if(cookies[i].indexOf("patcheditor=")==0){
        id=parseInt(cookies[i].split("=")[1]);
      }
    }
    if(id!=0&&id!=instanceid){
      AlertMsg("Another Patch Editor is launched.<br/> This instance is no more effective. <br/>Reload?",function(){
        window.location.href=url;
      });
      abort=true;
      return;
    }
    if(!this.midiout)
      return;
    if(this.supress)
      return;
    if(this.waitdata)
      return;
    if(this.scan>=0){
      if(this.que.length>0){
        var d=this.que.shift();
        this.SendDirect(d);
      }
      return;
    }
    else if(this.que.length>0){
      var d=this.que.shift();
      this.SendDirect(d);
    }
    else{
      if(this.ready){
        if(dirty>0){
          if(++dirty>40){
            dirty=0;
            if(autosave)
              StorePatch(currentpatch);
          }
        }
        this.SendWait([0xf0,0x52,0x00,this.devid,0x33,0xf7],"c0");
      }
    }
  };
  this.PortScan=function(){
    midioutputs=[];
    document.getElementById("midiport").innerHTML="";
    var i=0;
    var outputIterator=this.midiaccess.outputs.values();
    for(var o=outputIterator.next(); !o.done; o=outputIterator.next()) {
        midioutputs[i]=o.value;
        var op=new Option(o.value.name);
        if(o.value.name=="ZOOM MS Series")
          op.selected=true;
        else
          op.disabled=true;
        document.getElementById("midiport").options[i]=op;
        i++;
    }
    var inputIterator=this.midiaccess.inputs.values();
    for(var ip=inputIterator.next(); !ip.done; ip=inputIterator.next()){
      if(ip.value.name==="ZOOM MS Series" && this.midiinport==null){
        this.midiinport=ip.value;
        this.recvhander=this.recv.bind(this);
        this.midiinport.onmidimessage=this.recvhander;
      }
    }
  };
  this.SelectPort=function(){
    var idx=document.getElementById("midiport").selectedIndex;
    if(idx>=0 && midioutputs.length>0){
      this.midiout=midioutputs[idx];
      if(this.midiout.name!="ZOOM MS Series")
        this.midiout=null;
    }
  };
  this.PortScan();
  this.SelectPort();
  if(!this.midiout)
    AlertMsg("<br/>MIDI port is not found.<br/>Retry after connect ZOOM MS device.");
  this.timerid=setInterval(this.timer.bind(this),80);
}

function MakeStr(b){
  var str="";
  for(var j=0;j<b.length;++j)
    str+=("00"+b[j].toString(16)).substr(-2);
  return str;
}
function MakeName(b){
  var name="";
  var len=b.length;
  for(var j=0;j<13;++j){
    var c=b[((len>=146)?132:91)+j];
    if(c)
      name+=String.fromCharCode(c);
  }
  return name;
}
function MakeBin(s,len){
  var bin=[];
  s=s.replace(/[\x00-\x20\x7f-\x9f]/g, '');
  for(var j=0;j<s.length&&j<len*2;j+=2)
    bin.push(parseInt(s.substr(j,2),16));
  return bin;
}
function Init(){
  var i;
  if(!navigator.requestMIDIAccess){
    AlertMsg("This browser does not support Web MIDI API. Please use latest Chrome.");
    return;
  }
  url=location.href;
  instanceid=""+(Math.random()*1000000)|0;
  document.cookie="patcheditor="+instanceid;
  document.cookie="max-age=604800";
  var cookies=document.cookie.split(";");
  for(i=0;i<cookies.length;++i){
    if(cookies[i].indexOf("autosave=")==0){
      var as=parseInt(cookies[i].split("=")[1]);
      if(as==0)
        AutoSave();
    }
  }
  navigator.requestMIDIAccess({sysex:true}).then(
      function(ma){midiif=new MidiIf(ma);},
      function(e){AlertMsg("requestMIDIAccess Error");},
    );
  for(i=0;i<50;++i)
    patches[i]=new apatch();
  AutoSave();
  for(i=0;i<6;++i){
    var ef=document.getElementById("fnam"+(i+1));
    var im=document.getElementById("fimg"+(i+1));
    ef.draggable=true;
    im.draggable=false;
    ef.ondragstart=function(ev){
      ev.dataTransfer.setData("text",ev.target.id);
      this.classList.add("drag");
      currenteffect=parseInt(this.id[4])-1;
      for(var j=0;j<6;++j){
        var ef=document.getElementById("fnam"+(j+1));
        ef.ondragend=function(ev){
          this.classList.remove("drag");
          for(var jj=0;jj<6;++jj){
            var dst=document.getElementById("fnam"+(jj+1));
            dst.ondragenter=dst.ondragleave=dst.ondragover=dst.ondrop=null;
          }
        };
        ef.ondragenter=function(ev){
          var d=parseInt(ev.target.id[4])-1;
          if(d>currenteffect)
            this.classList.toggle("overdown");
          else if(d<currenteffect){
            this.classList.toggle("overup");
          }
        };
        ef.ondragleave=function(ev){
          var d=parseInt(ev.target.id[4])-1;
          if(d>currenteffect)
            this.classList.toggle("overdown");
          else if(d<currenteffect)
            this.classList.toggle("overup");
        };
        ef.ondragover=function(ev){
          ev.preventDefault();
        };
        ef.ondrop=function(ev){
          this.classList.remove("overup");
          this.classList.remove("overdown");
          var s=parseInt(event.dataTransfer.getData("text")[4])-1;
          var d=parseInt(ev.target.id[4])-1;
          if(s!=d){
            if(s>d){
              var e=GetEffect(currentpatch,s);
              for(var i=s;i>d;--i)
                SetEffect(currentpatch,i,GetEffect(currentpatch,i-1));
              SetEffect(currentpatch,d,e);
              SetCurrentEffect(d);
              DispPatchName(currentpatch);
              midiif.SendCurrentPatch();
              dirty=1;
            }
            else{
              var e=GetEffect(currentpatch,s);
              for(var i=s;i<d;++i)
                SetEffect(currentpatch,i,GetEffect(currentpatch,i+1));
              SetEffect(currentpatch,d,e);
              SetCurrentEffect(d);
              DispPatchName(currentpatch);
              midiif.SendCurrentPatch();
              dirty=1;
            }
          }
          ev.preventDefault();
        };
      }
    };
    var tab=document.getElementById("effects");
    for(var j=0;j<9;++j){
      var p=tab.rows[i].cells[j+2].childNodes[0];
      var c="f"+(i+1)+"p"+(j+1);
      var k=document.getElementById(c+"k");
      var s=document.getElementById(c+"s");
      p.onclick=p.oncontextmenu=function(ev){
        var id=ev.target.id;
        if(id[0]!="f")
          id=ev.target.parentNode.parentNode.id;
        currenteffect=parseInt(id[1])-1;
        currentparam=parseInt(id[3])-1;
        SetCurrentEffect(currenteffect);
        midiif.Send(patches[currentpatch].MakeBin(midiif.devid));
        UpdateFocus();
        ev.preventDefault();
      };
      k.valuetip=0;
      k.onchange = function(k){
        var f=parseInt(k.target.id[1]);
        var p=parseInt(k.target.id[3]);
        SetCurrentEffect(f-1);
        if(k.target.tab){
          var v=k.target.tab[k.target.value|0];
          SetParamVal(currentpatch,f-1,p+1,v);
        }
        else
          SetParamVal(currentpatch,f-1,p+1,k.target.value);
        DispPatch();

        if(f<=3 && f-1==currenteffect){
//          console.log("paramchange")
          midiif.SendParamChange(f-1,p+1,patches[currentpatch].GetParamVal(f-1,p+1));
        }
        else{
//          console.log("currentpat")
          midiif.SendCurrentPatch();
          currenteffect=f-1;
          dirty=1;
        }
      }
      if(s)
        s.onchange=function(s){
          var f=parseInt(s.target.id[1]);
          var p=parseInt(s.target.id[3]);
          SetCurrentEffect(f-1);
          SetParamVal(currentpatch,f-1,p+1,s.target.value);
          DispPatch();
          midiif.SendCurrentPatch();
          dirty=1;
        }
    }
  }
  for(i=0;i<50;++i){
    for(var ii=0;ii<6;++ii){
      var id=patches[i].GetEffectId(ii);
      if(id){
        effectlist[id].install=1;
        document.getElementById("e_"+id).classList.add("install");
      }
    }
    var cell=document.getElementById((i+1)+"nam");
    for(var f=0;f<6;++f){
      var c=document.createElement("div");
      c.setAttribute("style","right:"+(f*5)+"px");
      c.id=(i+1)+"_"+(f+1);
      c.setAttribute("class","eficon");
      cell.parentNode.appendChild(c);
    }
    var btn=document.getElementById((i+1)+"btn");
      cell.oncontextmenu=function(ev){
      PopupPatchMenu2(ev.target);
      ev.preventDefault();
    };
    cell.onclick=function(ev){
      document.getElementById("popuppatch").style.display="none";
      SelectPatch(parseInt(ev.target.id)-1);
    };
    cell.onmousedown=function(ev){
      document.getElementById("popuppatch").style.display="none";
      SelectPatch(parseInt(ev.target.id)-1);
    };
    btn.onmousedown=function(ev){
      document.getElementById("popuppatch").style.display="none";
      SelectPatch(parseInt(ev.target.id)-1);
    }
    btn.onclick=btn.oncontextmenu=function(ev){
      SelectPatch(parseInt(ev.target.id)-1);
      PopupPatchMenu2(ev.target);
      ev.stopPropagation();
      ev.preventDefault();
    };
    cell.draggable=true;
    cell.ondragstart=function(ev){
      ev.dataTransfer.setData("text",ev.target.id);
      this.classList.add("drag");
      for(var j=0;j<50;++j){
        var c=document.getElementById((j+1)+"nam");
        c.ondragenter=function(ev){this.classList.add("over");};
        c.ondragleave=function(ev){this.classList.remove("over");};
        c.ondragover=function(ev){ev.preventDefault();};
        c.ondrop=function(ev){
          this.classList.remove("over");
          var s=parseInt(event.dataTransfer.getData("text"));
          var d=parseInt(ev.target.id);
          if(s!=d){
            PopupPatchMenu(ev.target);
            dragtarget=ev.target;
          }
          ev.preventDefault();
        };
        c.ondragend=function(ev){
          this.classList.remove("over");
          this.classList.remove("drag");
          for(var jj=0;jj<50;++jj){
            cc=document.getElementById((jj+1)+"nam");
            cc.ondragenter=cc.ondragleave=cc.ondragover=cc.ondrop=cc.ondragend=null;
          }
        };
      }
    };
  }
  var p=document.getElementById("efpanel0");
  for(var id in effectlist){
    var ef=effectlist[id];
    var e=document.createElement("div");
    var im1="./images/50v"+(ef.ver&0xf)+".png";
    var im2="./images/60v"+((ef.ver>>4)&0xf)+".png";
    var im3="./images/70v"+((ef.ver>>8)&0xf)+".png";
    e.innerHTML="<div class='dspbar'></div><img src='./images/"+ef.name.replace(/ /g,"_")+".png' draggable='false'/><div>"+ef.name+"</div><img class='mk50' src='"+im1+"'/><img class='mk60' src='"+im2+"'/><img class='mk70' src='"+im3+"'/>";
    e.setAttribute("class","efitem");
    e.setAttribute("title",ef.title);
    var b=e.childNodes[0];
//    var d=(ef.dspmax+ef.dspmin)*.5;
    var d=1/ef.dsp;
    b.style.height=d*40+"px";
    var r=(d>=0.33?255:d*3*255)|0;
    var g=(d>=0.5?0:(d>=0.33?255-(d-0.33)*5.9*255:255))|0;
    b.style.background=ef.col="rgb("+r+","+g+",0)";
    b.style.borderTop=((40-d*40)|0)+"px solid #000";
    var div=document.getElementById("ef"+ef.group);
    if(div){
      div.appendChild(e);
      e.id="e_"+id;
      e.onclick=function(ev){
        if(document.getElementById("effectpanelmsg").innerHTML!="Install Check"){
          var id=ev.target.id;
          if(!id)
            id=ev.target.parentNode.id;
          id=parseInt(id.substring(2));
          var ef=GetEffectFromId(id);
          SetEffect(currentpatch,currenteffect,ef);
          SetCurrentEffect(currenteffect);
          EffectPanelCancel();
          if(effectlist[id].install==0){
            effectlist[id].install=-1;
            document.getElementById("e_"+id).classList.add("notinstall");
          }
          midiif.SendCurrentPatch();
          midiif.RequestPatch();
          dirty=1;

//?
//          midiif.SendCurrentPatchVerify(null,function(s){
//            AlertMsg("Effect "+s+" is not installed.");
//          });
        }
      }
    }
  }
  ShowDoc(GetLang()=="ja"?"ja":"en");
  inst=new InstallChecker();
  document.addEventListener("click",function(ev){
    PopupEffectCancel();
    PopupPatchCancel();
    PopupPatchCancel2();
  });
  document.addEventListener("keydown",function(ev){
    if(ready){
      var p;
      if(document.getElementById("inputbase").style.display=="block"
        || document.getElementById("confirmbase").style.display=="block"
        || document.getElementById("textareabase").style.display=="block")
        return;
      if(ev.ctrlKey||ev.altKey)
        return;
      if(ev.key=="ArrowUp"||ev.key=="ArrowDown"||ev.key=="PageUp"||ev.key=="PageDown"){
        if(currenteffect>=0&&currentparam>=0){
          var i="f"+(currenteffect+1)+"p"+(currentparam+1);
          var k=document.getElementById(i+"k");
          var s=document.getElementById(i+"s");
          if(k){
            var p1=Math.max((((k.max-k.min)*0.05)|0),1);
            var p2=Math.max((((k.max-k.min)*0.01)|0),1);
            var v=k.value;
            switch(ev.key){
            case "ArrowUp":
              if(ev.shiftKey)
                v=Math.min(v+=1,k.max);
              else if(ev.ctrlKey)
                v=Math.min(v+=p1,k.max);
              else
                v=Math.min(v+=p2,k.max);
              break;
            case "ArrowDown":
              if(ev.shiftKey)
                v=Math.max(v-=1,k.min);
              else if(ev.ctrlKey)
                v=Math.min(v-=p1,k.min);
              else
                v=Math.max(v-=p2,k.min);
              break;
            case "PageUp":
              v=Math.min(v+=p1,k.max);
              break;
            case "PageDown":
              v=Math.max(v-=p1,k.min);
              break;
            }
            if(k.setValue)
              k.setValue(v,true);
          }
        }
      }
      if(ev.key=="ArrowLeft" || ev.key=="ArrowRight"){
        p=currentpatch;
        if(ev.key=="ArrowLeft"){
          if(--p<0)
            p=49;
        }
        else{
          if(++p>=50)
            p=0;
        }
        SelectPatch(p);
        ev.preventDefault();
      }
      if(ev.key==tunerkey){
        document.getElementById("tunerbtn").click();
      }
      var p=patchkeymap.indexOf(ev.key);
      if(p>=0){
        SelectPatch(p);
        ev.preventDefault();
      }
      var e=effectkeymap.indexOf(ev.key);
      if(e>=0){
        SetCurrentEffect(e);
        ToggleEffect(e);
        ev.preventDefault();
      }
    }
  });
}
function Scan(){
  midiif.StartScan();
}
function StateChange(){
  console.log("StateChange");
}
function UpdateFocus(){
  var tab=document.getElementById("effects");
  for(f=0;f<6;++f){
    for(p=0;p<9;++p){
      var cell=tab.rows[f].cells[p+2].childNodes[0];
      if(f==currenteffect&&p==currentparam)
        cell.classList.add("pfocus");
      else
        cell.classList.remove("pfocus");
    }
  }
}
function AlertMsg(msg,callback){
  document.getElementById("alertmsg").innerHTML=msg;
  if(callback)
    document.getElementById("alertok").onclick=callback;
  else
    document.getElementById("alertok").onclick=function(){document.getElementById("alertbase").style.display="none"};
  document.getElementById("alertbase").style.display="block";
}
function Confirm(msg,callback,pos){
  document.getElementById("confirmmsg").innerHTML=msg;
  var st=document.getElementById("confirmpanel").style;
  if(pos){
    st.left=pos.x+"px",st.top=pos.y+"px";
    st.margin="0";
  }
  else{
    st.left=st.right=st.top=st.bottom="0";
    st.margin="auto";
  }
  document.getElementById("confirmok").onclick=callback;
  document.getElementById("confirmbase").style.display="block";
}
function PopupEffectMenu(tar){
  currenteffect=parseInt(tar.id[4])-1;
  UpdateFocus();
  var rc=tar.getBoundingClientRect();
  var e=document.getElementById("popupeffect");
  e.style.display="block";
  e.style.left=(rc.right+5+window.pageXOffset)+"px";
  e.style.top=(rc.top-20+window.pageYOffset)+"px";
}
function PopupEffectCancel(){
  document.getElementById("popupeffect").style.display="none";
}
function EffectPanelCancel(){
  document.getElementById("effectpanelbase").style.display="none";
}
function PopupEffectDelete(){
  var tar=document.getElementById("fnam"+(currenteffect+1));
  var rc=tar.getBoundingClientRect();
  var panel=document.getElementById("confirmpanel");
  Confirm("Delete Effect Unit ?",function(ev){
    var n=(midiif.devid==0x5f)?4:6;
    for(var j=currenteffect;j<n-1;++j){
      for(var i=0;i<11;++i){
        SetParamVal(currentpatch,j,i,GetParamVal(currentpatch,j+1,i));
      }
    }
    SetParamVal(currentpatch,n-1,0,1);
    for(var i=1;i<10;++i)
      SetParamVal(currentpatch,n-1,i,0);
    SetCurrentEffect(currenteffect);
    DispPatch();
    DispPatchName(currentpatch);
    midiif.SendCurrentPatch();
    midiif.RequestPatch();
    ev.target.parentNode.parentNode.style.display="none";
    dirty=1;
  },
  {x:(rc.left-20+window.pageXOffset),y:(rc.top+40+window.pageYOffset)});
}
function PopupEffectReplace(){
  document.getElementById("effectpanelmsg").innerHTML="Add / Replace Effect";
  document.getElementById("effectpanelbase").style.display="block";
}
function PopupEffectInsert(){
  var efmax=(midiif.devid==0x5f)?4:6;
  if(patches[currentpatch].fx[efmax-1][1]!=0)
    return;
  for(var j=efmax-1;j>currenteffect;--j){
    for(var k=0;k<11;++k){
      SetParamVal(currentpatch,j,k,GetParamVal(currentpatch,j-1,k));
    }
  }
  SetParamVal(currentpatch,currenteffect,0,1);
  for(var k=1;k<11;++k)
    SetParamVal(currentpatch,currenteffect,k,0);
  DispPatch();
  DispPatchName(currentpatch);
  SetCurrentEffect(currenteffect);
  midiif.SendCurrentPatch();
  dirty=1;
  PopupEffectCancel();
}
function PopupEffectUp(){
  if(currenteffect>0){
    var e=GetEffect(currentpatch,currenteffect);
    SetEffect(currentpatch,currenteffect,GetEffect(currentpatch,currenteffect-1));
    SetEffect(currentpatch,currenteffect-1,e);
    DispPatchName(currentpatch);
    midiif.SendCurrentPatch();
    dirty=1;
  }
  PopupEffectCancel();
}
function PopupEffectDown(){
  if(currenteffect<5){
    var e=GetEffect(currentpatch,currenteffect);
    SetEffect(currentpatch,currenteffect,GetEffect(currentpatch,currenteffect+1));
    SetEffect(currentpatch,currenteffect+1,e);
    DispPatchName(currentpatch);
    midiif.SendCurrentPatch();
    dirty=1;
  }
  PopupEffectCancel();
}
function PopupPatchMenu2(tar){
  var rc=tar.getBoundingClientRect();
  var e=document.getElementById("popuppatch2");
  e.style.display="block";
  e.style.left=(rc.left-20+window.pageXOffset)+"px";
  e.style.top=(rc.top+20+window.pageYOffset)+"px";
}
function PopupPatchCancel2(){
  document.getElementById("popuppatch2").style.display="none";
}
function PopupPatchMenu(tar){
  var rc=tar.getBoundingClientRect();
  var e=document.getElementById("popuppatch");
  e.style.display="block";
  e.style.left=(rc.left-20+window.pageXOffset)+"px";
  e.style.top=(rc.top+20+window.pageYOffset)+"px";
}
function PopupPatchCancel(){
  var e=document.getElementById("popuppatch");
  e.style.display="none";
  if(dragtarget){
    dragtarget=null;
  }
}
function PopupPatchOverwrite(){
  var t=(parseInt(dragtarget.id)-1);
  document.getElementById("popuppatch").style.display="none";
  clipboard.CopyFrom(patches[currentpatch]);
  SelectPatch(t);
  PopupPatchPaste(t);
  dragtarget=null;
}
function PopupPatchExchange(){
  var dst=parseInt(dragtarget.id)-1;
  clipboard.CopyFrom(patches[currentpatch]);
  patches[currentpatch].CopyFrom(patches[dst]);
  DispPatchName(currentpatch);
  SendPatch(currentpatch);
  PopupPatchPaste(dst);
  dragtarget=null;
  var e=document.getElementById("popuppatch");
  e.style.display="none";
}
function PopupPatchCopy(){
  clipboard.CopyFrom(patches[currentpatch]);
  PopupPatchCancel2();
}
function PopupPatchPaste(t){
  if(clipboard){
    if(typeof(t)=="undefined")
      t=currentpatch;
    patches[t].CopyFrom(clipboard);
    DispPatch();
    DispPatchName(t);
    if(t!=currentpatch)
      SelectPatch(t);
    midiif.Send(patches[currentpatch].MakeBin(midiif.devid));
    midiif.RequestPatch();
    if(autosave)
      StorePatch(t);
  }
  PopupPatchCancel2();
}
function PopupPatchDelete(){
  var tar=document.getElementById((currentpatch+1)+"nam");
  var rc=tar.getBoundingClientRect();
  var panel=document.getElementById("confirmpanel");
  Confirm("Delete patch ?",function(ev){
    for(var i=0;i<6;++i){
      for(var j=0;j<11;++j){
        patches[currentpatch].fx[i][j]=0;
      }
    }
    patches[currentpatch].maxfx=1;
    patches[currentpatch].curfx=0;
    patches[currentpatch].name="Empty";
    midiif.Send(patches[currentpatch].MakeBin(midiif.devid));
    midiif.RequestPatch();
    DispPatchName(currentpatch);
    DispPatch();
    if(autosave)
      StorePatch(currentpatch);
    ev.target.parentNode.parentNode.style.display="none";
  },
  {x:(rc.left-55+window.pageXOffset), y:(rc.top+24+window.pageYOffset)},
  );
  PopupPatchCancel2();
}
function PopupPatchRename(){
  document.getElementById("inputtext").value="";
  var tar=document.getElementById((currentpatch+1)+"nam");
  document.getElementById("inputmsg").innerHTML="Rename Patch";
  var rc=tar.getBoundingClientRect();
  document.getElementById("inputbase").style.display="block";
  var panel=document.getElementById("inputpanel");
  panel.style.left=(rc.left-80+window.pageXOffset)+"px";
  panel.style.top=(rc.top+20+window.pageYOffset)+"px";
  PopupPatchCancel2();
  document.getElementById("inputok").onclick=function(ev){
    var i;
    var name=document.getElementById("inputtext").value;
    var p=currentpatch;
    patches[p].name=name.substr(0,10);
    DispPatchName(p);
    midiif.SendCurrentPatch();
    if(autosave)
      StorePatch(currentpatch);
    document.getElementById("inputbase").style.display="none";
  };
}
function SelectPort(){
  if(midioutputs.length>0){
    midiif.midiout=midioutputs[document.getElementById("midiport").selectedIndex];
    if(midiif.midiout && midiif.midiout.name!="ZOOM MS Series")
      midiif.midiout=null;
  }
}
function GetEffectId(p,n){
  return GetParamVal(p,n,1);
}
function GetDspState(p,n){
  if(midiif.devid==0x5f){
    return (patches[p].data[88]>>n)&1;
  }
  else{
    return (patches[p].data[129]>>n)&1;
  }
}

function apatch(){
  this.name="";
  this.fx=[
    [0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0],
  ];
  this.maxfx=1;
  this.curfx=0;
  this.dspstate=0;
}
apatch.prototype.CopyFrom=function(a){
  this.name=a.name.slice(0);
  for(var i=0;i<6;++i)
    for(var j=0;j<11;++j)
      this.fx[i][j]=a.fx[i][j];
  this.maxfx=a.maxfx;
  this.curfx=a.curfx;
  this.dspstate=0;
};
apatch.prototype.empty146=[
  0xf0,0x52,0x00,0x58,0x28,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
  0x00,0x00,0x00,0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
  0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
  0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
  0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
  0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
  0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x40,0x05,0x0f,0x45,0x00,0x6d,0x70,0x74,0x79,0x20,0x20,
  0x20,0x00,0x20,0x20,0x00,0xf7
];
apatch.prototype.empty105=[
  0xf0,0x52,0x00,0x5f,0x28,0x00,0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
  0x00,0x00,0x00,0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
  0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
  0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
  0x00,0x00,0x00,0x00,0x00,0x10,0x00,0x00,0x40,0x04,0x0f,0x45,0x6d,0x00,0x70,0x74,0x79,0x20,0x20,0x20,
  0x20,0x00,0x20,0x00,0xf7
];
apatch.prototype.bits=[
  [ //eff0
    [[6,1,0]],  //State
    [[5,0x40,24],[6,0x7e,16],[7,0x07,8],[9,0x1f,0]], //ID
    [[9,0x60,-5],[5,0x8,-1],[10,0x7f,3],[5,0x4,8],[11,0x1,11]],  //Params2-
    [[11,0x7c,-2],[5,0x2,4],[12,0x1f,6]],
    [[5,0x1,0],[14,0x7f,1],[13,0x40,2],[15,0x3,9]],
    [[15,0x70,-4],[13,0x20,-2],[16,0x0f,4]],
    [[16,0x70,-4],[13,0x10,-1],[17,0x0f,4]],
    [[17,0x70,-4],[13,0x08,0],[18,0x0f,4]],
    [[18,0x70,-4],[13,0x04,1],[19,0x0f,4]],
    [[19,0x70,-4],[13,0x02,2],[20,0x1f,4],[23,0x40,"NZ"]],
    [[24,0x7f,0],[21,0x10,3]],
  ],
  [ //eff1
    [[26,1,0]], //State
    [[21,0x4,28],[26,0x7e,16],[27,0x07,8],[30,0x1f,0]], //ID
    [[30,0x60,-5],[29,0x40,-4],[31,0x7f,3],[29,0x20,5],[32,0x1,11]],
    [[32,0x7c,-2],[29,0x10,1],[33,0x1f,6]],
    [[29,0x8,-3],[34,0x7f,1],[29,0x4,6],[35,0x3,9]],
    [[35,0x70,-4],[29,0x2,2],[36,0x0f,4]],
    [[36,0x70,-4],[29,0x1,3],[38,0x0f,4]],
    [[38,0x70,-4],[37,0x40,-3],[39,0x0f,4]],
    [[39,0x70,-4],[37,0x20,-2],[40,0x0f,4]],
    [[40,0x70,-4],[37,0x10,-1],[41,0x1f,4],[43,0x40,"NZ"]],
    [[44,0x7f,0],[37,0x1,7]],
  ],
  [ //eff2
    [[47,1,0]], //State
    [[45,0x20,25],[47,0x7e,16],[48,0x07,8],[50,0x1f,0]],  //ID
    [[50,0x60,-5],[45,0x4,0],[51,0x7f,3],[45,0x2,9],[52,0x1,11]],
    [[52,0x7c,-2],[45,0x1,5],[54,0x1f,6]],
    [[53,0x40,-6],[55,0x7f,1],[53,0x20,3],[56,0x3,9]],
    [[56,0x70,-4],[53,0x10,-1],[57,0x0f,4]],
    [[57,0x70,-4],[53,0x8,0],[58,0x0f,4]],
    [[58,0x70,-4],[53,0x4,1],[59,0x0f,4]],
    [[59,0x70,-4],[53,0x2,2],[60,0x0f,4]],
    [[60,0x70,-4],[53,0x1,3],[62,0x1f,4],[64,0x40,"NZ"]],
    [[65,0x7f,0],[61,0x8,4]],
  ],
  [ //eff3
    [[67,1,0]], //State
    [[61,0x2,29],[67,0x7e,16],[68,0x07,8],[71,0x1f,0]], //ID
    [[71,0x60,-5],[69,0x20,-3],[72,0x7f,3],[69,0x10,6],[73,0x1,11]],
    [[73,0x7c,-2],[69,0x8,2],[74,0x1f,6]],
    [[69,0x4,-2],[75,0x7f,1],[69,0x2,7],[76,0x3,9]],
    [[76,0x70,-4],[69,0x1,3],[78,0x0f,4]],
    [[78,0x70,-4],[77,0x40,-3],[79,0x0f,4]],
    [[79,0x70,-4],[77,0x20,-2],[80,0x0f,4]],
    [[80,0x70,-4],[77,0x10,-1],[81,0x0f,4]],
    [[81,0x70,-4],[77,0x8,0],[82,0x1f,4],[84,0x40,"NZ"]],
    [[86,0x7f,0],[85,0x40,1]],
  ],
  [ //eff4
    [[88,1,0]], //State
    [[85,0x10,26],[88,0x7e,16],[89,0x07,8],[91,0x1f,0]],  //ID
    [[91,0x60,-5],[85,0x2,1],[92,0x7f,3],[85,0x1,10],[94,0x1,11]],
    [[94,0x7c,-2],[93,0x40,-1],[95,0x1f,6]],
    [[93,0x20,-5],[96,0x7f,1],[93,0x10,4],[97,0x3,9]],
    [[97,0x70,-4],[93,0x8,0],[98,0x0f,4]],
    [[98,0x70,-4],[93,0x4,1],[99,0x0f,4]],
    [[99,0x70,-4],[93,0x2,2],[100,0x0f,4]],
    [[100,0x70,-4],[93,0x1,3],[102,0x0f,4]],
    [[102,0x70,-4],[101,0x40,-3],[103,0x1f,4],[105,0x40,"NZ"]],
    [[106,0x7f,0],[106,0x4,5]],
  ],
  [ //eff5
    [[108,1,0]],  //State
    [[101,0x1,30],[108,0x7e,16],[110,0x07,8],[112,0x1f,0]], //ID
    [[112,0x60,-5],[109,0x10,-2],[113,0x7f,3],[109,0x8,7],[114,0x1,11]],
    [[114,0x7c,-2],[109,0x4,3],[115,0x1f,6]],
    [[109,0x2,-1],[116,0x7f,1],[109,0x1,8],[118,0x3,9]],
    [[118,0x70,-4],[117,0x40,-3],[119,0x0f,4]],
    [[119,0x70,-4],[117,0x20,-2],[120,0x0f,4]],
    [[120,0x70,-4],[117,0x10,-1],[121,0x0f,4]],
    [[121,0x70,-4],[117,0x8,0],[122,0x0f,4]],
    [[122,0x70,-4],[117,0x4,1],[123,0x1f,4],[126,0x40,"NZ"]],
    [[127,0x7f,0],[125,0x20,2]],
  ]
];
apatch.prototype.namidx=[
  [91,92,94,95,96,97,98,99,100,102],
  [132,134,135,136,137,138,139,140,142,143]
];
apatch.prototype.cabbyte=[
  23,43,64,84,105,126,
];
apatch.prototype.v2byte=[
  8,28,49,70,
];
apatch.prototype.maxfxidx=[
  89,130,
];
apatch.prototype.GetParamVal=function(n,p){
  return this.fx[n][p];
}
apatch.prototype.GetEffectId=function(n){
  return this.fx[n][1];
};
apatch.prototype.GetEffectState=function(n){
  return this.fx[n][0];
};
apatch.prototype.GetDspState=function(n){
  return (this.dspstate>>n)&1;
}
apatch.prototype.GetCurFxBit=function(dat){
  if(dat.length<146)
    return 3-(((dat[88]&0x40)>>6)+((dat[85]&0x10)>>3));
  else
    return 6-(((dat[130]&1)<<2)+((dat[125]&8)>>2)+((dat[129]&0x40)>>6));
};
apatch.prototype.SetCurFxBit=function(dat,n){
  if(dat.length<146){
    n=3-n;
    dat[88]=(dat[88]&~0x40)+((n&1)<<6);
    dat[85]=(dat[85]&~0x10)+((n&2)<<3);
  }
  else{
    n=5-n;
    dat[129]=(dat[129]&~0x40)+((n&1)<<6);
    dat[125]=(dat[125]&~0x8)+((n&2)<<2);
    dat[130]=(dat[130]&~1)+((n&4)>>2);
  }
}
apatch.prototype.SetMaxFxBit=function(dat,n){
  var len=dat.length;
  var o=this.maxfxidx[len>=146?1:0];
  if(n==0) n=1;
  if(n>6) n=6;
  if(len<146 && n>4) n=4;
  dat[o]=(dat[o]&~0x1c)+(n<<2);
};
apatch.prototype.GetMaxFxBit=function(dat){
  return (dat[this.maxfxidx[dat.length>=146?1:0]]&0x1c)>>2;
};
apatch.prototype.SetBits=(dat,bits,val)=>{
  var len=dat.length;
  var blen=bits.length;
  for(var i=0;i<blen;++i){
    var b0=bits[i];
    var bb,v;
    if(b0[0]<len){
      if(b0[2]==="NZ"){
        dat[b0[0]]=(dat[b0[0]]&~b0[1])+(val!=0?b0[1]:0);
      }
      else{
        if(b0[2]>=0)
          v=val>>b0[2];
        else
          v=val<<-b0[2];
        dat[b0[0]]=(dat[b0[0]]&~b0[1])+(v&b0[1]);
      }
    }
  }
};
apatch.prototype.GetBits=(dat,bits)=>{
  var len=dat.length;
  var val=0;
  for(var i=0;i<bits.length;++i){
    var b0=bits[i];
    if(b0[0]<len && b0[2]!=="NZ"){
      var r=b0[0];
      if(r<len){
        var v=dat[b0[0]]&b0[1];
        if(b0[2]>=0)
          v<<=b0[2];
        else
          v>>=-b0[2];
        val|=v;
      }
    }
  }
  return val;
};
apatch.prototype.ReadBin=function(dat){
  var len=dat.length;
  var name="";
  for(var j=0;j<13;++j){
    var c=dat[((len>=146)?132:91)+j];
    if(c)
      name+=String.fromCharCode(c);
  }
  this.name=name.replace(/ +$/,"");
  var flen=(len>=146)?6:4;
  for(var f=0;f<6;++f){
    for(var p=0;p<11;++p){
      if(f>=flen)
        this.fx[f][p]=0;
      else
        this.fx[f][p]=this.GetBits(dat,this.bits[f][p]);
    }
  }
  this.maxfx=this.GetMaxFxBit(dat);
  this.curfx=this.GetCurFxBit(dat);
  this.dspstate=dat[(len>=146)?129:88]&0x3f;
};
apatch.prototype.MakeBin=function(id){
  var i,r,flen;
  if(id==0x5f){
    r=this.empty105.slice(0);
    flen=4;
  }
  else{
    r=this.empty146.slice(0);
    flen=6;
  }
  r[3]=id;
  var len=r.length;
  var name=this.name;
  if(name.length>10)
    name=name.substr(0,10);
  for(i=0;i<10;++i){
    var c=name.charCodeAt(i);
    r[this.namidx[(id==0x5f)?0:1][i]]=(isNaN(c)?0x20:c);
  }
  for(var f=0;f<flen;++f){
    for(var p=0;p<11;++p){
      this.SetBits(r,this.bits[f][p],this.fx[f][p]);
    }
    var ef=effectlist[this.fx[f][1]];
    if(ef && ef.group=="AMP"){
      if((ef.ver&0xf0)==0x20){
        r[this.v2byte[f]]=0x20;
      }
      if(ef.ver&0xf){
        r[this.cabbyte[f]]=(this.fx[f][9]?0x40:0);
      }
      else{
        switch(this.fx[f][9]){
        case 0:
          r[this.cabbyte[f]]=0; break;
        case 16:
        case 32:
        case 48:
        case 96:
        case 112:
        case 192:
          r[this.cabbyte[f]]=0x50; break;
        default:
          r[this.cabbyte[f]]=0x51; break;
        }
      }
    }
  }
  i=(len>=146?5:3);
  while(i>0){
    if(this.fx[i][1]!=0)
      break;
    --i;
  }
  this.SetMaxFxBit(r,i+1);
  this.SetCurFxBit(r,this.curfx);
  return r;
};



var nullpatch=new apatch();

function GetParamVal(p,n,param){
  var pat=patches[p];
  if(!pat)
    return 0;
  return pat.fx[n][param];
}
function SetParamVal(p,n,param,val){
  var pat=patches[p];
  if(!pat)
    return 0;
  pat.fx[n][param]=val;
}
function GetCurrentEffect(){
  var pat=patches[currentpatch];
  if(!pat)
    return 0;
  var len=pat.data.length;
  if(len>=146)
    return 6-(((pat.data[130]&1)<<2)+((pat.data[125]&8)>>2)+((pat.data[129]&0x40)>>6));
  else
    return 3-(((pat.data[88]&0x40)>>6)+((pat.data[85]&0x10)>>3));
}
function SetCurrentEffect(n){
  var pat=patches[currentpatch];
  if(!pat)
    return 0;
  pat.curfx=n;
}
function GetEffectMax(){
  var pat=patches[currentpatch];
  if(!pat)
    return 0;
  if(pat.length<146)
    return (pat.data[89]&0x1c)>>2;
  return (pat.data[130]&0x1c)>>2;
}
function SetEffectMax(n){
  var pat=patches[currentpatch];
  if(!pat)
    return 0;
  if(pat.length<146)
    pat.data[89]=(pat.data[89]&~0x1c)+((n<<2)&0x1c);
  else
    pat.data[130]=(pat.data[130]&~0x1c)+((n<<2)&0x1c);
}
function GetEffectFromId(id){
  var ef=[];
  if(!effectlist[id])
    id=0;
  var e=effectlist[id];
  id=parseInt(id);
  ef.push(1);
  ef.push(id);
  for(var i=0;i<e.param.length;++i)
    ef.push(e.param[i].def);
  for(;i<9;++i)
    ef.push(0);
  return ef;
}
function GetEffect(p,n){
  var ef=[];
  for(var i=0;i<11;++i)
    ef.push(GetParamVal(p,n,i));
  return ef;
}
function SetEffect(p,n,ef){
  for(var i=0;i<11;++i){
    SetParamVal(p,n,i,ef[i]);
  }
  DispPatch();
}
function GetEffectParams(p,n){
  var r=[];
  for(var i=0;i<9;++i)
    r.push(GetParamVal(p,n,i));
  return r;
}
function GetEffectState(p,n){
  return GetParamVal(p,n,0);
}
function SetEffectState(p,n,on){
  SetParamVal(p,n,0,on?1:0);
  if(p==currentpatch){
    var id=GetEffectId(p,n);
    if(midiif.dump==3)
      console.log("effectid:"+id.toString(16));
    var ef=effectlist[id];
    var c=document.getElementById("fnam"+(n+1));
    if(ef && id!=0 && on)
      c.classList.add("press");
    else
      c.classList.remove("press");
  }
}
function ToggleEffect(n){
  SetEffectState(currentpatch, n,GetEffectState(currentpatch,n)^1);
  midiif.SendCurrentPatch();
}
function DispPatchName(p){
  document.getElementById((p+1)+"nam").innerHTML=patches[p].name;
  for(var i=0;i<6;++i){
    var id=patches[p].GetEffectId(i);
    var on=patches[p].GetEffectState(i);
    var icon=document.getElementById((p+1)+"_"+(i+1));
    if(midiif.devid==0x5f &&i>=4){
      icon.style.display="none";
    }
    else{
      icon.style.display="block";
    }
    if(id)
      icon.classList.add("exist");
    else
      icon.classList.remove("exist");
    if(on)
      icon.classList.add("on");
    else
      icon.classList.remove("on");
  }
}
function DispPatch(patch){
  var efmax,n,p,cell;
  var dspgraph=document.getElementById("dspgraph");
  var tab=document.getElementById("effects");
  if(typeof(patch)=="undefined")
    patch=currentpatch;
  efmax=(midiif.devid==0x5f)?4:6;
  dspgraph.style.height=42*efmax+"px";
  var dspsum=0;
  for(n=0;n<efmax;++n){
    var id=patches[patch].GetEffectId(n);
    var ef=effectlist[id];
    if(!ef)
      id=0,ef=effectlist[0];
    var b=dspgraph.childNodes[n];
//    b.style.height=(ef.dspmax+ef.dspmin)*50+"%";
    b.style.height=(1/ef.dsp)*100+"%";
    b.style.background=ef.col;
    var c=document.getElementById("fnam"+(n+1));
    var t=document.getElementById("ftxt"+(n+1));
    var img=document.getElementById("fimg"+(n+1));
    var full=document.getElementById("full"+(n+1));
    full.src=patches[patch].GetDspState(n)?"./images/dspfull.png":"./images/THRU.png";
    if(ef){
      full.title=ef.title;
      img.src="./images/"+ef.name.replace(/ /g,"_")+".png";
      if(ef.name=="THRU")
        c.classList.add("thru");
      else
        c.classList.remove("thru");
      t.innerHTML=ef.name;
    }
    else{
      full.title="";
      img.src="";
      t.innerHTML="unknown";
    }
    if(ef && id!=0 && patches[patch].GetEffectState(n))
      c.classList.add("press");
    else
      c.classList.remove("press");
    if(ef){
      for(p=0;p<9;++p){
        cell=tab.rows[n].cells[p+1];
        var s="f"+(n+1)+"p"+(p+1);
        var el=document.getElementById(s+"l");
        var ek=document.getElementById(s+"k");
        var es=document.getElementById(s+"s");
        var ev=document.getElementById(s+"v");
        if(p<ef.param.length){
          el.innerHTML=ef.param[p].name;
          ev.style.display="block";
          if(ef.param[p].max==1){
            es.style.display="block";
            ek.style.display="none";
          }
          else{
            es.style.display="none";
            ek.style.display="block";
          }
          var v=patches[patch].GetParamVal(n,p+2);
          if(typeof(ef.param[p].max)=="object"){
            for(var k=ef.param[p].max.length-1;k>=0;--k){
              if(ef.param[p].max[k]==v){
                v=k;
                break;
              }
            }
          }
          var ds=ef.param[p].disp;
          switch(typeof(ds)){
          case "number":
            var dr=ef.param[p].dispr;
            if(dr>0){
              if(dr<1){
                ev.value=(v*dr+ds).toFixed(1);
              }
              else
                ev.value=v*dr+ds;
            }
            else
              ev.value=v+ds;
            break;
          case "object":
            ev.value=ds[v];
            break;
          default:
            ev.value=v;
          }
          if(typeof(ef.param[p].max)=="object"){
              ek.max=ef.param[p].max.length-1;
              ek.tab=ef.param[p].max;
              ek.setValue(v);
          }
          else{
            ek.max=ef.param[p].max;
            ek.tab=null;
            ek.defvalue=ef.param[p].def;
            es.defvalue=ef.param[p].def;
            if(ek.setValue)
              ek.setValue(v);
            if(es.setValue)
              es.setValue(v);
          }
        }
        else{
          el.innerHTML="";
          ek.style.display="none";
          ev.style.display="none";
          es.style.display="none";
        }
      }
    }
  }
}
function SelectPatch(p){
  p=parseInt(p);
  if(p<0)
    return;
  if(p==currentpatch)
    return;
  midiif.Send([0xc0,p]);
  SetPatchFocus(0);
  currentpatch=p;
  SetPatchFocus(1);
  DispPatch();
}
function SetPatchFocus(f){
  if(currentpatch<0)
    return;
  c=document.getElementById((currentpatch+1)+"nam");
  if(f)
    c.classList.add("sel");
  else
    c.classList.remove("sel");
}
function SendPatch(p){
  p=parseInt(p);
  midiif.Send(patches[p].MakeBin(midiif.devid));
}
function StorePatch(p,callback){
  console.log("store:"+p);
  var cmd=[0xf0,0x52,0x00,midiif.devid,0x32,0x01,0x00,0x00,0x2c,0x00,0x00,0x00,0x00,0x00,0xf7];
  cmd[8]=p;
  if(callback){
    midiif.SendWait(cmd,midiif.sysexhead+"00",callback);
  }
  else
    midiif.Send(cmd);
}
function InstallChecker(){
  this.list=[];
  this.n=0;
  this.norg=0;
  this.porg=new apatch();
  this.Start=function(){
    this.norg=currentpatch;
    this.porg.CopyFrom(patches[49]);
    SelectPatch(49);
    this.n=0;
    for(var id in effectlist){
      if(effectlist[id].install==0){
        effectlist[id].install=-1;
        document.getElementById("e_"+id).classList.add("notinstall");
        this.list.push(parseInt(id));
      }
    }
    if(this.list.length>0){
      document.getElementById("waitmsg").innerHTML="";
      document.getElementById("waitbase").style.display="block";
    }
  };
  this.timer=function(){
    if(this.list.length<=0)
      return;
    document.getElementById("waitmsg").innerHTML="Effect Install Check...("+this.list.length+")";
    while(this.n<4&&this.list.length>0){
      SetEffect(currentpatch,this.n,GetEffectFromId(this.list.shift()));
      ++this.n;
    }
    this.n=0;
    midiif.Send(patches[currentpatch].MakeBin(midiif.devid));
    midiif.Send([0xf0,0x52,0,midiif.devid,0x29,0xf7]);
    if(this.list.length<=0){
      setTimeout(function(){
        midiif.Send(this.porg.MakeBin(midiif.devid));
        patches[49].CopyFrom(this.porg);
        DispPatchName(currentpatch);
        DispPatch();
        SelectPatch(currentpatch);
        document.getElementById("waitbase").style.display="none";
      }.bind(this),700);
    }
  };
  this.ShowAll=function(f){
    for(id in effectlist){
      var el=document.getElementById("e_"+id);
      if(el){
        if(f)
          el.style.display="inline-block";
        else{
          var ef=effectlist[id];
          if(ef.install>=-1)
            el.style.display="inline-block";
          else
            el.style.display="none";
        }
      }
    }
  };
  setInterval(this.timer.bind(this),500);
}
function InstallCheck(){
  document.getElementById("effectpanelmsg").innerHTML="Install Check";
  document.getElementById("effectpanelbase").style.display="block";
  inst.Start();
}
function SavePatchToDevice(){
  StorePatch(currentpatch,function(){});
}
function SaveAllToDevice(){
  var saver=new StoreAll();
}
function AutoSave(){
  var btn=document.getElementById("autosavebtn");
  if(btn){
    if(btn.style.background==""){
        btn.style.background="linear-gradient(#c33,#b22)";
        btn.style.color="#fff";
        document.getElementById("devsavebtn").disabled=true;
        autosave=1;
    }
    else{
      btn.style.background="";
      btn.style.color="#000";
      document.getElementById("devsavebtn").disabled=false;
      autosave=0;
    }
    document.cookie="autosave="+autosave;
  }
}
function Tuner(){
  var btn=document.getElementById("tunerbtn");
  if(btn.style.background==""){
      btn.style.background="linear-gradient(#c33,#b22)";
      btn.style.color="#fff";
      midiif.Send([0xb0,0x4a,0x7f]);
  }
  else{
    btn.style.background="";
    btn.style.color="#000";
    midiif.Send([0xb0,0x4a,0x00]);
  }
}
function Usage(){
  var e=document.getElementById("usagebase");
  if(e.style.display!="block"){
    e.style.display="block";
  }
  else{
    e.style.display="none";
  }
}
function SaveBank(){
  var p;
  var zip=new JSZip();
  for(p=0;p<50;++p){
    var s=MakeStr(patches[p].MakeBin(midiif.devid))+"\r\n";
    var n=("0"+(p+1)).substr(-2)+"@"+(patches[p].name.replace(/ +/g,"").replace(/ /g,"_"))+"."+midiif.devstr;
    zip.file(n,s);
  }
  zip.generateAsync({type:"blob"}).then(function (blob) {
    var a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.target="_blank";
    a.download="newbank."+midiif.devstr+".zip";
    a.click();
  });
}
function StoreAll(callback){
  document.getElementById("waitmsg").innerHTML="Storing...";
  document.getElementById("waitbase").style.display="block";
  this.res=[];
  this.cnt=0;
  this.ready=0;
  this.cb=callback;
  this.Next=function(){
    if(this.cnt>=50){
      document.getElementById("waitbase").style.display="none";
      this.ready=1;
      if(this.cb)
        this.cb();
      return;
    }
    document.getElementById("waitmsg").innerHTML="Storing...("+this.cnt+"/50)";
    midiif.SendDirect([0xc0,this.cnt]);
    midiif.SendDirect(patches[this.cnt].MakeBin(midiif.devid));
    StorePatch(this.cnt++,this.Next.bind(this));
  };
  this.Next();
}
function LoadBank(){
  var i=document.createElement("input");
  i.type="file";
  i.click();
  i.addEventListener("change",function(ev){
    var file=ev.target.files;
    var reader=new FileReader();
    var zip=new JSZip();
    var cnt=0;
    if(file[0].name.substr(-4)==".zip"){
      reader.onload=function(ev){
        zip.loadAsync(reader.result).then(
          function(zip){
            console.log("loadbank");
            Confirm("Overwrite all patches, Sure?",
              function(ev){
                ev.target.parentNode.parentNode.style.display="none";
                zip.forEach(function(name,c){
                  zip.file(name).async("string").then(function(txt){
                    var n=parseInt(name.substr(0,2))-1;
                    var bin=MakeBin(txt,146);
                    patches[n].ReadBin(bin);
                    if(bin[3]!=midiif.devid){
                      AlertMsg("This patch is not for "+midiif.devstr);
                      return;
                    }
                    DispPatchName(n);
                    if(autosave){
                      if(++cnt>=50){
                        new StoreAll(function(){
                          document.getElementById("waitbase").style.display="none";
                        });
                      }
                    }
                  });
                });
              }
            );
          }
        )
      };
      reader.readAsArrayBuffer(file[0]);
    }
    else{
      reader.readAsText(file[0]);
      reader.onload=function(ev){
        if(reader.result.indexOf("1:f052005828")!=0){
          AlertMsg("Bank file error");
          return;
        }
        var s=reader.result.split("\n");
        for(var i=0;i<50;++i){
          s[i]=s[i].split(":");
          patches[i].ReadBin(MakeBin(s[i][1],146));
          DispPatchName(i);
        }
        if(autosave){
          new StoreAll(function(){
            document.getElementById("waitbase").style.display="none";
          });
        }
      }
    }
  },false);
}
function ShowPatch(){
  var p=currentpatch;
  if(p<0)
    return;
  var n=patches[p].name;
  var fname=n.replace(/\s+$/,"").replace(/ /g,"_");
  var d=MakeStr(patches[p].MakeBin(midiif.devid));
  AlertMsg("Show Patch As Text <br/><textarea disabled style='width:360px;height:100px'>"+d+"</textarea>");
}
function ExportPatch(){
  var p=currentpatch;
  if(p<0)
    return;
  var n=patches[p].name;
  var fname=n.replace(/\s+$/,"").replace(/ /g,"_");
  var d=MakeStr(patches[p].MakeBin(midiif.devid));
  var blob=new Blob([d],{"type":"text/plain"});
  var a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.target="_blank";
  a.download=fname+"."+midiif.devstr;
  a.click();
}
function ReadPatch(data){
  if(data[3]!=midiif.devid){
    Confirm("This patch is not for MS-"+midiif.devstr+".<br/> Load anyway ?",function(ev){
      data[3]=midiif.devid;
      ev.target.parentNode.parentNode.style.display="none";
      ReadPatch(data);
    });
    return;
  }
  patches[currentpatch].ReadBin(data);
  DispPatchName(currentpatch);
  DispPatch(currentpatch);
  SelectPatch(currentpatch);
  midiif.SendCurrentPatchVerify(function(s){
    if(s)
      AlertMsg("Following effect(s) are not exist<br/>"+s);
    console.log(s);
  });
  if(autosave)
    StorePatch(currentpatch);
}
function ImportPatch(){
  var p=currentpatch;
  if(p<0)
    return;
  var i=document.createElement("input");
  i.type="file";
  i.click();
  i.addEventListener("change",function(ev){
    var file=ev.target.files;
    if(file[0].name.substr(-4)==".zip"){
      document.getElementById("patchenum").style.display="block";
      var reader=new FileReader();
      var zip=new JSZip();
      var cnt=0;
      reader.onload=function(ev){
        zip.loadAsync(reader.result).then(
          function(zip){
            for(var i=0;i<50;++i)
              document.getElementById("patchenumlist").rows[i%10].cells[(i/10)|0].innerHTML="";
            zip.forEach(function(name,c){
              zip.file(name).async("string").then(function(txt){
                var n=parseInt(name.substr(0,2))-1;
                var e=document.createElement("button");
                e.setAttribute("class","patchbtn");
                e.data=MakeBin(txt,146);
                name=name.replace(/.50g$/,"").replace(/.60b$/,"").replace(/.70cdr$/,"");
                e.innerHTML=name;
                document.getElementById("patchenumlist").rows[n%10].cells[(n/10)|0].appendChild(e);
                e.onclick=function(){
                  ReadPatch(this.data);
                  document.getElementById("patchenum").style.display="none";
                }
              });
            });
          }
        );
      };
      reader.readAsArrayBuffer(file[0]);
      return;
    }
    var reader=new FileReader();
    reader.readAsText(file[0]);
    reader.onload=function(ev){
      var data=MakeBin(reader.result,146);
      ReadPatch(data);
    }
  },false);
}
function ImportText(){
  var tar=document.getElementById((currentpatch+1)+"nam");
  var panel=document.getElementById("textareabase");
  document.getElementById("textareamsg").innerHTML="Load from Text : Pate here the Text from 'Show Patch as text' or guitarpatches.com's zoom MS-50G patch page texts.";
  document.getElementById("textareatext").value="";
  var rc=tar.getBoundingClientRect();
  panel.style.display="block";
  PopupPatchCancel2();
  document.getElementById("textareaok").onclick=function(ev){
    var str=document.getElementById("textareatext").value;
    var h=str.indexOf("f05200");
    if(h>=0){
      var str=str.substr(h);
      var data=MakeBin(str,146);
      console.log(data);
      var len=0;
      if(data[145]==0xf7) len=146;
      if(data[104]==0xf7) {
        len=105;
        data=slice(0,105);
      }
      console.log(data);
      if(len){
        ReadPatch(data);
        document.getElementById("textareabase").style.display="none";
        return;
      }
    }
    var tx=str.split("\n");
    var param=0;
    var id=0;
    var found=0;
    var name="";
    for(var l=0,m=tx.length;l<m;++l){
      if(tx[l].indexOf("Description")==0 && l>0){
        for(var ll=l-1;ll>=0&&ll>=l-2;--ll)
          if(tx[ll].length>0)
            name=tx[ll].substr(0,10);
      }
      if(tx[l].indexOf("EFFECT")==0){
        var n=parseInt(tx[l][7])-1;
        if(n>=0 && n<6){
          found=1;
          var enam=tx[l].split(":")[1].substr(1);
          if(enam=="OFF")
            enam="THRU";
          for(id in effectlist){
            if(effectlist[id].name==enam){
              SetEffect(currentpatch,n,GetEffectFromId(id));
              break;
            }
          }
        }
      }
      if(param>=2&&param<11){
        var v=parseInt(tx[l]);
        var pm=effectlist[id].param[param-2];
        if(pm){
          if(typeof(pm.disp)=="number"){
            v-=pm.disp;
          }
          else if(typeof(pm.disp)=="object"){
            for(v=0;v<pm.disp.length;++v){
              if(pm.disp[v].toLowerCase().indexOf(tx[l].toLowerCase())==0){
                break;
              }
            }
            if(v==pm.disp.length)
              v=0;
            if(typeof(pm.max)=="object")
              v=pm.max[v];
          }
          SetParamVal(currentpatch,n,param,v);
        }
        param=0;
      }
      if(tx[l].indexOf("Page")==0){
        var t=tx[l].split("-");
        param=parseInt(t[0].substr(4))*3+parseInt(t[1].substr(4))-2;
      }
    }
    if(found){
      patches[currentpatch].name=name;
      DispPatchName(currentpatch);
      DispPatch(currentpatch);
      SelectPatch(currentpatch);
      midiif.SendCurrentPatchVerify(function(s){
        if(s)
          AlertMsg("Following effect(s) are not exist<br/>"+s);
        console.log(s);
      });
      if(autosave)
        StorePatch(currentpatch);
    }
    else {
      AlertMsg("No patch data is found.");
    }
    document.getElementById("textareabase").style.display="none";
  };
}
function ShowDoc(x) {
	var divs=document.getElementsByTagName("div");
	var t="doc_"+x;
	for(var i=0;i<divs.length;++i) {
		if(divs[i].className==="doc_ja")
			divs[i].style.display=(x==="ja")?"block":"none";
		if(divs[i].className=="doc_en")
			divs[i].style.display=(x==="ja")?"none":"block";
	}
}
function GetLang() {
	return (navigator.language || navigator.browserLanguage).substring(0, 2);
}
window.addEventListener("load",Init);

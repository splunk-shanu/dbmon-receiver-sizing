// Sizing model for the Splunk OTel Collector running N database receivers.
//
// Fitted from two validated benchmark runs (50 and 200 receivers) that share the same measured
// host, with db.server.query_sample and db.server.top_query enabled. The 1-receiver run is
// excluded from the fit: it used a 4 vCPU host and barely exercises the event pipeline, so it
// does not sit on the same line.
const MODEL = {
  peakCpuMc: (n) => 9.42 * n + 709,   // millicores
  peakRssMiB: (n) => 8.09 * n + 746,  // MiB
  fittedFrom: [50, 200],
  measured: {
    50:  { peakCpuMc: 1180, peakRssMiB: 1151 },
    200: { peakCpuMc: 2593, peakRssMiB: 2364 },
  },
};

// Only Oracle has been benchmarked this way. The others are offered because the question gets
// asked, but their cost is NOT known: the model is reused as a rough proxy and the page says so
// loudly. Replace an entry with its own fitted coefficients once that engine is measured.
const ENGINES = {
  oracle:     { label: 'Oracle',     measured: true,
                detail: 'AWS RDS Oracle SE2 19c, HammerDB TPROC-C, 20 warehouses' },
  sqlserver:  { label: 'SQL Server', measured: false },
  postgresql: { label: 'PostgreSQL', measured: false },
  mysql:      { label: 'MySQL',      measured: false },
};

// vCPU / GiB. Families marked "compute" are compute-optimised, "general" general purpose.
const AWS = [
  { name: 't3.small',    vcpu: 2,  gib: 2,  family: 'general' },
  { name: 't3.medium',   vcpu: 2,  gib: 4,  family: 'general' },
  { name: 'c6i.large',   vcpu: 2,  gib: 4,  family: 'compute' },
  { name: 'c5.large',    vcpu: 2,  gib: 4,  family: 'compute' },
  { name: 't3.large',    vcpu: 2,  gib: 8,  family: 'general' },
  { name: 'm6i.large',   vcpu: 2,  gib: 8,  family: 'general' },
  { name: 'm5.large',    vcpu: 2,  gib: 8,  family: 'general' },
  { name: 'c6i.xlarge',  vcpu: 4,  gib: 8,  family: 'compute' },
  { name: 'c5.xlarge',   vcpu: 4,  gib: 8,  family: 'compute' },
  { name: 'm6i.xlarge',  vcpu: 4,  gib: 16, family: 'general' },
  { name: 'm5.xlarge',   vcpu: 4,  gib: 16, family: 'general' },
  { name: 'c6i.2xlarge', vcpu: 8,  gib: 16, family: 'compute' },
  { name: 'c5.2xlarge',  vcpu: 8,  gib: 16, family: 'compute' },
  { name: 'm6i.2xlarge', vcpu: 8,  gib: 32, family: 'general' },
  { name: 'm5.2xlarge',  vcpu: 8,  gib: 32, family: 'general' },
  { name: 'c6i.4xlarge', vcpu: 16, gib: 32, family: 'compute' },
  { name: 'c5.4xlarge',  vcpu: 16, gib: 32, family: 'compute' },
  { name: 'm6i.4xlarge', vcpu: 16, gib: 64, family: 'general' },
  { name: 'c6i.8xlarge', vcpu: 32, gib: 64, family: 'compute' },
];

const AZURE = [
  { name: 'Standard_B2s',     vcpu: 2,  gib: 4,  family: 'general' },
  { name: 'Standard_F2s_v2',  vcpu: 2,  gib: 4,  family: 'compute' },
  { name: 'Standard_B2ms',    vcpu: 2,  gib: 8,  family: 'general' },
  { name: 'Standard_D2s_v5',  vcpu: 2,  gib: 8,  family: 'general' },
  { name: 'Standard_F4s_v2',  vcpu: 4,  gib: 8,  family: 'compute' },
  { name: 'Standard_B4ms',    vcpu: 4,  gib: 16, family: 'general' },
  { name: 'Standard_D4s_v5',  vcpu: 4,  gib: 16, family: 'general' },
  { name: 'Standard_F8s_v2',  vcpu: 8,  gib: 16, family: 'compute' },
  { name: 'Standard_B8ms',    vcpu: 8,  gib: 32, family: 'general' },
  { name: 'Standard_D8s_v5',  vcpu: 8,  gib: 32, family: 'general' },
  { name: 'Standard_F16s_v2', vcpu: 16, gib: 32, family: 'compute' },
  { name: 'Standard_D16s_v5', vcpu: 16, gib: 64, family: 'general' },
  { name: 'Standard_F32s_v2', vcpu: 32, gib: 64, family: 'compute' },
];

function shortlist(catalogue, needVcpu, needGib, pref) {
  const pool = catalogue.filter((i) => pref === 'any' || i.family === pref);
  const fits = pool.filter((i) => i.vcpu >= needVcpu && i.gib >= needGib);
  // Cheapest-first proxy: fewest vCPU, then least memory.
  fits.sort((a, b) => a.vcpu - b.vcpu || a.gib - b.gib);
  return fits.slice(0, 4);
}

function renderRows(el, rows, needVcpu, needGib) {
  if (!rows.length) {
    el.innerHTML = '<tr><td colspan="3" style="color:var(--stop-ink)">' +
      'Nothing in the catalogue satisfies ' + needVcpu + ' vCPU / ' + needGib.toFixed(1) +
      ' GiB. Scale out across multiple collectors.</td></tr>';
    return;
  }
  el.innerHTML = rows.map((i, idx) =>
    '<tr class="' + (idx === 0 ? 'pick' : '') + '">' +
    '<td class="name">' + i.name + (idx === 0 ? '<span class="tag">minimum</span>' : '') + '</td>' +
    '<td>' + i.vcpu + '</td><td>' + i.gib + ' GiB</td></tr>'
  ).join('');
}

function engineNote(key) {
  const e = ENGINES[key];
  if (e.measured) return null;
  return { cls: 'stop', html:
    '<b>' + e.label + ' has not been measured.</b> Every figure below is the <b>Oracle</b> model ' +
    'reused as a rough proxy. Per-receiver cost depends on what each receiver\'s queries ask of ' +
    'its database, and those differ substantially between engines, so treat this as an order of ' +
    'magnitude only \u2014 not a sizing you can commit to. Benchmark ' + e.label +
    ' before relying on it.' };
}

function validityNote(n) {
  const [lo, hi] = MODEL.fittedFrom;
  if (n < lo) {
    return { cls: 'stop', html:
      '<b>Below the measured range.</b> The model is fitted from ' + lo + ' and ' + hi +
      ' receivers. Cost is superlinear below ' + lo + ' because of the large fixed term, so this ' +
      'figure <b>over-states</b> what you need at ' + n + ' receivers. For reference, a single ' +
      'receiver measured 40 mc peak CPU and 261 MiB peak RSS.' };
  }
  if (n > hi) {
    return { cls: 'warn', html:
      '<b>Extrapolated beyond the measured range.</b> Nothing above ' + hi +
      ' receivers has been tested. Treat this as an estimate and validate before committing ' +
      'to it; per-receiver cost may not stay linear.' };
  }
  return { cls: 'ok', html: '' };
}

function update() {
  const n = Math.max(1, parseInt(document.getElementById('n').value || '1', 10));
  const headroom = parseFloat(document.getElementById('headroom').value);
  const pref = document.getElementById('family').value;
  const engineKey = document.getElementById('engine').value;

  const peakMc = MODEL.peakCpuMc(n);
  const peakMiB = MODEL.peakRssMiB(n);
  const needCores = (peakMc * headroom) / 1000;
  const needGib = (peakMiB * headroom) / 1024;
  const needVcpu = Math.max(1, Math.ceil(needCores));

  document.getElementById('req').innerHTML =
    '<div><div class="k">Peak CPU</div><div class="v">' + Math.round(peakMc) +
      '<small>mc</small></div></div>' +
    '<div><div class="k">Peak memory</div><div class="v">' + Math.round(peakMiB) +
      '<small>MiB</small></div></div>' +
    '<div><div class="k">Min vCPU</div><div class="v">' + needVcpu + '</div></div>' +
    '<div><div class="k">Min memory</div><div class="v">' + needGib.toFixed(1) +
      '<small>GiB</small></div></div>';

  // Across the whole model range this lands between 0.89 and 1.03 GiB per core, and every
  // general-purpose and compute family ships at least 2 GiB per core. CPU therefore binds
  // everywhere: memory never decides the instance.
  const gibPerCore = needGib / needCores;
  document.getElementById('binding').textContent =
    'Needs ' + gibPerCore.toFixed(2) + ' GiB per core. CPU is the binding dimension at every ' +
    'receiver count in this model, so size on vCPU and the memory that comes with the instance ' +
    'will be ample.';

  const notes = [engineNote(engineKey), validityNote(n)]
    .filter((x) => x && x.html)
    .map((x) => '<div class="note ' + x.cls + '">' + x.html + '</div>');
  document.getElementById('validity').innerHTML = notes.join('');

  const eng = ENGINES[engineKey];
  document.getElementById('engine-hint').textContent =
    eng.measured ? 'Measured' : 'Not measured \u2014 Oracle proxy';

  renderRows(document.getElementById('aws'), shortlist(AWS, needVcpu, needGib, pref), needVcpu, needGib);
  renderRows(document.getElementById('azure'), shortlist(AZURE, needVcpu, needGib, pref), needVcpu, needGib);

  document.getElementById('basis').innerHTML =
    '<div class="formula">peak CPU  (mc)  = 9.42 &times; N + 709\n' +
    'peak RSS  (MiB) = 8.09 &times; N + 746</div>' +
    '<p>Fitted from two validated runs at <b>50</b> and <b>200</b> receivers (23/23 checks each) on ' +
    'a <code>c5.2xlarge</code> collector host: 1,180 mc / 1,151 MiB and 2,593 mc / 2,364 MiB peak. ' +
    'Marginal cost per receiver is <b>9.4 mc and 8.1 MiB</b>; fixed cost with the event pipeline ' +
    'active is <b>~709 mc and ~746 MiB</b>.</p>' +
    '<p>Measured with Splunk OTel Collector <b>0.161.0</b> against AWS RDS Oracle SE2 19c, ' +
    'HammerDB TPROC-C at 20 warehouses, with <code>db.server.query_sample</code> and ' +
    '<code>db.server.top_query</code> both enabled. Peak is a 2-second instantaneous maximum.</p>' +
    '<p><b>Oracle only.</b> ' + (eng.measured
      ? 'SQL Server, PostgreSQL and MySQL receivers have not been measured this way; their ' +
        'per-receiver cost will differ.'
      : 'You have selected <b>' + eng.label + '</b>, which has no measurements of its own \u2014 ' +
        'the figures above are the Oracle model reused.') +
    ' Set <code>SPLUNK_MEMORY_TOTAL_MIB</code> above the ' +
    'peak memory figure — the memory limiter refuses telemetry before the host is exhausted, so a ' +
    'host sized tight on memory drops data rather than slowing down.</p>' +
    '<p>Instance shortlists are ordered by fewest vCPU then least memory, which is a proxy for ' +
    'cost rather than a price lookup. Confirm current pricing and regional availability.</p>';
}

['n', 'engine', 'headroom', 'family'].forEach((id) =>
  document.getElementById(id).addEventListener('input', update));
update();

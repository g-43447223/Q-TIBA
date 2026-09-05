// ============================================================
// Q-TIBA Apps Script (Google Sheets Backend)
// v1.1 - Serasi dengan cutoff 7:21, absent list & guru scan
// ============================================================

// CUTOFF KELEWATAN (minit): 7:21 AM = lewat
var LATE_HOUR = 7;
var LATE_MINUTE = 21;

// ============================================================
// API KEY - PADANKAN DENGAN config.js (QTIBA_API_KEY)
// !!! WAJIB GANTI dengan nilai yang unik sebelum deploy !!!
// Ini menghalang orang luar dari memanggil Web App tanpa kebenaran.
// ============================================================
var API_KEY = "QTiba-336244-CHANGE-ME-SEKRET"; // GANTI INI dengan key yang sama dalam config.js

// Sahkan request datang dengan API key yang betul.
// Key dihantar sebagai query parameter: ?apiKey=xxx&action=yyy
function isAuthorizedRequest(e) {
  var key = String((e && e.parameter && e.parameter.apiKey) || '');
  return key !== '' && key === API_KEY;
}

// Hasilkan hash SHA-256 (hex). PIN disimpan sebagai hash, bukan plain text,
// supaya jika Google Sheet bocor, PIN sebenar tidak terdedah.
function hashPin(pin) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(pin || ''),
    Utilities.Charset.UTF_8
  );
  var hex = '';
  for (var i = 0; i < digest.length; i++) {
    var byte = (digest[i] < 0) ? digest[i] + 256 : digest[i];
    hex += ('0' + byte.toString(16)).slice(-2);
  }
  return hex;
}

// Normalisasi PIN untuk perbandingan/simpanan.
// - Jika value sudah berbentuk hash 64-hex, anggap ia hash (value lama tidak berubah).
// - Jika sebaliknya (legacy plain text), hashkan ia.
function normalizePin(pin) {
  var raw = String(pin || '').trim().toLowerCase();
  if (/^[0-9a-f]{64}$/.test(raw)) {
    return raw;
  }
  return hashPin(raw);
}

// Soalan biasa: adakah stored ini plain text atau hash? (untuk log sahaja)
function isHashed(value) {
  return /^[0-9a-f]{64}$/.test(String(value || '').trim());
}

// ============================================================
// KONFIGURASI PUSAT (CUTOFF & HARI CUTI)
// Satu sumber kebenaran untuk cutoff masab & senarai cuti.
// Admin boleh ubah dalam tab "Tetapan" (lajur A=kunci, B=nilai):
//   cutoff  -> 07:21           (masa cutoff kelewatan)
//   hujung  -> 0,6             (nombor hari minggu, 0=Ahad, 6=Sabtu)
//   cuti    -> senarai cuti (lihat format di bawah)
// Jika tab "Tetapan" tiada, fallback kepada nilai 2026 Kumpulan B.
//
// Format "cuti":
//   - Tarikh tunggal:  YYYY-MM-DD|Nama  (dipisah ;)
//   - Julat:           YYYY-MM-DD:YYYY-MM-DD|Nama
//   Contoh:
//   2026-01-01|Tahun Baru;2026-05-23:2026-06-07|Cuti Pertengahan Tahun
// ============================================================
var DEFAULT_CUTOFF = "07:21";
var DEFAULT_HUJUNG = [0, 6];
var DEFAULT_CUTI = [
  "2026-01-01|Tahun Baru",
  "2026-02-17|Tahun Baru Cina",
  "2026-02-18|Tahun Baru Cina",
  "2026-03-21|Hari Raya Aidilfitri",
  "2026-03-22|Hari Raya Aidilfitri",
  "2026-03-23|Hari Raya Aidilfitri (Cuti Ganti)",
  "2026-03-21:2026-03-29|Cuti Penggal 1",
  "2026-05-01|Hari Pekerja",
  "2026-05-23:2026-06-07|Cuti Pertengahan Tahun",
  "2026-05-27|Hari Raya Aidiladha",
  "2026-05-31|Hari Wesak",
  "2026-06-01|Hari Keputeraan YDP Agong",
  "2026-06-02|Hari Wesak (Cuti Ganti)",
  "2026-06-17|Awal Muharam",
  "2026-08-25|Maulidur Rasul",
  "2026-08-29:2026-09-06|Cuti Penggal 2",
  "2026-08-31|Hari Kebangsaan",
  "2026-09-16|Hari Malaysia",
  "2026-11-08|Hari Deepavali",
  "2026-11-09|Hari Deepavali (Cuti Ganti)",
  "2026-12-05:2026-12-31|Cuti Akhir Tahun",
  "2026-12-25|Hari Krismas"
];

// Bina objek settings (fallback jika tab "Tetapan" tidak wujud atau kosong).
function getSettings() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tab = null;
  try { tab = ss.getSheetByName("Tetapan"); } catch (err) { tab = null; }

  var cutoff = DEFAULT_CUTOFF;
  var hujungArr = DEFAULT_HUJUNG;
  var cutiList = DEFAULT_CUTI.slice();

  if (tab) {
    var data = tab.getDataRange().getValues();
    var map = {};
    for (var i = 0; i < data.length; i++) {
      var key = String(data[i][0] || "").trim().toLowerCase();
      if (key !== "") map[key] = String(data[i][1] || "").trim();
    }

    if (map["cutoff"] && /^\d{1,2}:\d{2}$/.test(map["cutoff"])) {
      cutoff = map["cutoff"];
    }
    if (map["hujung"]) {
      var parsed = String(map["hujung"]).split(/[\s,;]+/).map(function (n) { return parseInt(n, 10); })
        .filter(function (n) { return n >= 0 && n <= 6; });
      if (parsed.length > 0) hujungArr = parsed;
    }
    if (map["cuti"]) {
      cutiList = String(map["cuti"]).split(";").map(function (s) { return s.trim(); }).filter(function (s) { return s !== ""; });
    }
  }

  var cp = cutoff.split(":");
  var cutoffHour = parseInt(cp[0], 10);
  var cutoffMinute = parseInt(cp[1], 10);

  // Tukar senarai string kepada objek (tarikh tunggal / julat).
  var cuti = [];
  for (var k = 0; k < cutiList.length; k++) {
    var item = cutiList[k];
    var bar = item.lastIndexOf("|");
    var nama = bar > -1 ? item.substring(bar + 1).trim() : "Hari Cuti";
    var tarikhPart = bar > -1 ? item.substring(0, bar).trim() : item.trim();
    var colon = tarikhPart.indexOf(":");
    if (colon > -1) {
      var mulai = tarikhPart.substring(0, colon).trim();
      var akhir = tarikhPart.substring(colon + 1).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(mulai) && /^\d{4}-\d{2}-\d{2}$/.test(akhir)) {
        cuti.push({ mulai: mulai, akhir: akhir, nama: nama });
      }
    } else {
      if (/^\d{4}-\d{2}-\d{2}$/.test(tarikhPart)) {
        cuti.push({ tarikh: tarikhPart, nama: nama });
      }
    }
  }

  return {
    cutoff: cutoff,
    cutoffHour: cutoffHour,
    cutoffMinute: cutoffMinute,
    cutoffMin: cutoffHour * 60 + cutoffMinute,
    hujungMinggu: hujungArr,
    cuti: cuti
  };
}

// ============================================================
// REKOD INTERVENSI (tracking surat / kaunseling / rujuk)
// Tab "Intervensi": A=ID, B=Status, C=Tarikh, D=Nota
// ============================================================
function getIntervensiSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tab = ss.getSheetByName("Intervensi");
  if (!tab) {
    tab = ss.insertSheet("Intervensi");
    tab.getRange(1, 1, 1, 4).setValues([["ID", "Status", "Tarikh", "Nota"]]);
    tab.setFrozenRows(1);
  }
  return tab;
}

// Baca semua rekod intervensi menjadi objek map: { id: {status,tarikh,nota} }
function readIntervensiMap() {
  var tab = getIntervensiSheet_();
  var data = tab.getDataRange().getValues();
  var map = {};
  for (var i = 1; i < data.length; i++) {
    var id = String(data[i][0] || "").trim();
    if (id === "") continue;
    map[id] = {
      status: String(data[i][1] || "Belum"),
      tarikh: String(data[i][2] || ""),
      nota: String(data[i][3] || "")
    };
  }
  return map;
}

// Tulis/upsert satu rekod intervensi bagi seorang murid
function writeIntervensi(id, rec) {
  var tab = getIntervensiSheet_();
  var data = tab.getDataRange().getValues();
  var found = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || "").trim() === String(id).trim()) { found = i + 1; break; }
  }
  if (found > -1) {
    tab.getRange(found, 1, 1, 4).setValues([[String(id), rec.status, rec.tarikh, rec.nota]]);
  } else {
    tab.appendRow([String(id), rec.status, rec.tarikh, rec.nota]);
  }
}

// ============================================================
// PARSING TARIKH FLEKSIBEL - keselarasan data #2
// Data tarikh dalam sheet kadang-kala disimpan sebagai tarikh
// sebenar (Date), kadang-kala sebagai teks dengan pelbagai format.
// Fungsi ini menukar ke objek Date yang sah, atau null jika tak boleh.
// ============================================================
function parseFlexibleDate(value) {
  if (value == null) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  var s = String(value).trim();
  if (s === '') return null;

  // Cuba parse terus oleh enjin JS (ISO standard)
  var d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d;
  }

  // Pisahkan tarikh & masa jika ada
  var sDate = s;
  var sTime = '00:00:00';
  var spaceMatch = s.match(/^(.+?)\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (spaceMatch) {
    sDate = spaceMatch[1];
    sTime = spaceMatch[2] + ':' + spaceMatch[3] + ':' + (spaceMatch[4] || '00');
  }

  // Format tarikh day/month/year dengan pelbagai pemisah
  var m = sDate.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})$/);
  if (m) {
    var day = parseInt(m[1], 10);
    var mon = parseInt(m[2], 10);
    var yr = parseInt(m[3], 10);
    if (yr < 100) yr += 2000;
    var t = sTime.split(':');
    var hr = parseInt(t[0], 10);
    var mn = parseInt(t[1], 10);
    var sc = t.length > 2 ? parseInt(t[2], 10) : 0;
    var parsed = new Date(yr, mon - 1, day, hr, mn, sc);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  // Sesetengah lokasi gunakan bulan-nama (cth. 26 Aug 2026)
  var m2 = sDate.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{2,4})$/);
  if (m2) {
    var monName = m2[2].slice(0, 3);
    var months = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
    if (months[monName.toLowerCase()] !== undefined) {
      var yr2 = parseInt(m2[3], 10);
      if (yr2 < 100) yr2 += 2000;
      var parsed2 = new Date(yr2, months[monName.toLowerCase()], parseInt(m2[1], 10));
      if (!isNaN(parsed2.getTime())) return parsed2;
    }
  }

  return null;
}

// ============================================================
// SESI ADMIN (Token) - keselamatan #3
// Setiap kali admin log masuk dengan betul, server mengeluarkan
// token sesi (UUID) yang sah selama SESSION_MINUTES minit. Token
// ini diperlukan untuk tindakan sensitif seperti tukar PIN atau
// daftar admin baharu. Sesiapa yang menetapkan sahaja
// 'qtiba_admin_auth' di penyemak imbas TANPA log masuk tidak akan
// ada token yang sah, lalu dia tetap ditolak di sisi server.
// ============================================================
var SESSION_MINUTES = 60;

function issueSessionToken(email) {
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put(
    'session_' + token,
    JSON.stringify({ email: email, exp: new Date().getTime() + SESSION_MINUTES * 60000 }),
    21600 // max TTL (6 jam)
  );
  return token;
}

// Semak token sesi masih sah dan pulangkan email admin, atau null.
function requireAdminToken(e) {
  var token = String((e && e.parameter && e.parameter.token) || '').trim();
  if (token === '') return null;
  var cache = CacheService.getScriptCache();
  var raw = cache.get('session_' + token);
  if (!raw) return null;
  try {
    var data = JSON.parse(raw);
    if (data.exp < new Date().getTime()) {
      cache.remove('session_' + token);
      return null;
    }
    return String(data.email || '').toLowerCase();
  } catch (err) {
    return null;
  }
}

// 1. MENGAMBIL DAN MENGANALISIS DATA UNTUK DASHBOARD & SCANNER
function doGet(e) {
  var action = e.parameter.action;

  // PENGAWAL KESELAMATAN: Semua request mesti bawa API key yang betul.
  if (!isAuthorizedRequest(e)) {
    return jsonResponse({ status: "Error", message: "Unauthorized: API key tidak sah." });
  }

  // FUNGSI KONFIGURASI PUSAT (cutoff & hari cuti)
  if (action === "settings") {
    return jsonResponse(Object.assign({ status: "Success" }, getSettings()));
  }

  // FUNGSI AMBIL REKOD INTERVENSI (tracking surat/kaunseling)
  if (action === "intervensi") {
    return jsonResponse({ status: "Success", intervensi: readIntervensiMap() });
  }

  // FUNGSI SEMAK STATUS ADMIN
  if (action === "verifyAdmin") {
    var inputEmail = String(e.parameter.email || "").trim().toLowerCase();
    var inputPin = String(e.parameter.pin || "").trim();

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Admin");
    var isAuthorized = false;

    if (sheet && inputEmail !== "" && inputPin !== "") {
      var data = sheet.getDataRange().getValues();
      var inputHash = normalizePin(inputPin);
      for (var i = 1; i < data.length; i++) {
        var dbEmail = String(data[i][0] || "").trim().toLowerCase();
        var dbPin = String(data[i][1] || "").trim();
        if (dbEmail === inputEmail && normalizePin(dbPin) === inputHash) {
          // Migrasi automatik: jika penyimpanan lama (plain text), naik taraf ke hash
          if (!isHashed(dbPin) && dbPin !== '') {
            sheet.getRange(i + 1, 2).setValue(inputHash);
          }
          isAuthorized = true;
          break;
        }
      }
    }

    var token = null;
    if (isAuthorized) {
      token = issueSessionToken(inputEmail);
    }

    return jsonResponse({
      status: "Success",
      authorized: isAuthorized,
      token: token
    });
  }

  // FUNGSI TUKAR PIN ADMIN
  if (action === "changePin") {
    // Tindakan sensitif: mesti log masuk dengan betul (token sah) + API key.
    var sessionEmail = requireAdminToken(e);
    if (!sessionEmail) {
      return jsonResponse({ status: "Error", message: "Sesi sah tidak dijumpai. Sila log masuk semula." });
    }

    var email = String(e.parameter.email || "").trim().toLowerCase();
    var currentPin = String(e.parameter.currentPin || "").trim();
    var newPin = String(e.parameter.newPin || "").trim();

    // Hanya pemilik akaun yang log masuk boleh menukar PIN akaun sendiri.
    if (email !== sessionEmail) {
      return jsonResponse({ status: "Error", message: "Anda hanya boleh menukar PIN akaun anda sendiri." });
    }

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Admin");
    var updated = false;

    if (sheet && email && currentPin && newPin) {
      var data = sheet.getDataRange().getDisplayValues();
      var currentHash = normalizePin(currentPin);
      var newHash = normalizePin(newPin);
      for (var i = 1; i < data.length; i++) {
        var dbRowEmail = String(data[i][0]).trim().toLowerCase();
        var dbRowPin = String(data[i][1]).trim();
        if (dbRowEmail === email && normalizePin(dbRowPin) === currentHash) {
          sheet.getRange(i + 1, 2).setValue(newHash);
          updated = true;
          break;
        }
      }
    }
    return jsonResponse({
      status: updated ? "Success" : "Error",
      message: updated ? "PIN berjaya ditukar!" : "Emel atau PIN asal tidak sah."
    });
  }

  // FUNGSI DAFTAR ADMIN BAHARU (OLEH ADMIN SEDIA ADA)
  if (action === "registerAdmin") {
    // Tindakan sensitif: mesti log masuk dengan betul (token sah) + API key.
    var sessionEmail = requireAdminToken(e);
    if (!sessionEmail) {
      return jsonResponse({ status: "Error", message: "Sesi sah tidak dijumpai. Sila log masuk semula." });
    }

    var adminEmail = String(e.parameter.adminEmail || "").trim().toLowerCase();
    var adminPin = String(e.parameter.adminPin || "").trim();
    var newEmail = String(e.parameter.newEmail || "").trim().toLowerCase();
    var newPin = String(e.parameter.newPin || "").trim();

    // Pengesah mestilah akaun yang sedang log masuk dalam sesi.
    if (adminEmail !== sessionEmail) {
      return jsonResponse({ status: "Error", message: "Pengesahan Admin tidak sepadan dengan sesi log masuk." });
    }

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Admin");
    if (!sheet) {
      return jsonResponse({ status: "Error", message: "Tab Admin tidak dijumpai." });
    }

    var data = sheet.getDataRange().getDisplayValues();
    var isAuth = false;
    var exists = false;
    var adminHash = normalizePin(adminPin);

    for (var i = 1; i < data.length; i++) {
      var adminRowEmail = String(data[i][0]).trim().toLowerCase();
      var adminRowPin = String(data[i][1]).trim();
      if (adminRowEmail === adminEmail && normalizePin(adminRowPin) === adminHash) {
        isAuth = true;
      }
      if (adminRowEmail === newEmail) {
        exists = true;
      }
    }

    if (!isAuth) {
      return jsonResponse({ status: "Error", message: "Pengesahan Admin gagal." });
    }
    if (exists) {
      return jsonResponse({ status: "Error", message: "Emel cikgu ini sudah berdaftar!" });
    }

    sheet.appendRow([newEmail, normalizePin(newPin)]);
    return jsonResponse({ status: "Success", message: "Admin baharu berjaya didaftarkan!" });
  }

  // ===== DATA UTAMA DASHBOARD & SCANNER =====
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetMurid = ss.getSheetByName("MuridSasaran");
    var sheetRekod = ss.getSheetByName("Rekod");

    if (!sheetMurid) {
      return jsonResponse({ status: "Error", message: "Tab 'MuridSasaran' tidak dijumpai!" });
    }

    // Konfigurasi pusat (cutoff & cuti) — satu sumber kebenaran.
    var settingsData = getSettings();
    var cutoffMinSelasa = settingsData.cutoffMin;

    // A. BACA DATA MURID SASARAN
    var dataMurid = sheetMurid.getDataRange().getValues();
    var muridMap = {};
    var muridList = [];

    for (var i = 1; i < dataMurid.length; i++) {
      var row = dataMurid[i];
      if (row[0]) {
        var idStr = String(row[0]).trim();
        var obj = {
          id: idStr,
          nama: String(row[1] || '').trim(),
          kelas: String(row[2] || '').trim(),
          urlGambar: String(row[3] || '').trim(),
          kiraan: 0,
          kesMingguIni: 0,
          kesMingguLepas: 0,
          kesBulanIni: 0,
          kesBulanLepas: 0,
          lewatHariIni: false,
          waktuHariIni: '',
          tarikhLewat: '',
          punca: ''
        };
        muridMap[idStr] = obj;
        muridList.push(obj);
      }
    }

    // B. BACA DATA REKOD IMBASAN KELEWATAN
    var rekodList = [];
    var slotWaktu = [0, 0, 0, 0];
    var trendMingguan = [0, 0, 0, 0, 0, 0];
    var todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");

    // === Sempadan tempoh (untuk pembahagian kes) ===
    var now = new Date();
    var startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Minggu ini: bermula Isnin (Hari 1) minggu semasa
    var dayOfWeek = startOfToday.getDay(); // 0 = Ahad, 1 = Isnin ...
    var startOfThisWeek = new Date(startOfToday);
    var diffToMonday = (dayOfWeek + 6) % 7; // hari dari Isnin
    startOfThisWeek.setDate(startOfToday.getDate() - diffToMonday);

    var startOfLastWeek = new Date(startOfThisWeek);
    startOfLastWeek.setDate(startOfThisWeek.getDate() - 7);

    var startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    var startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    var endOfLastMonth = startOfThisMonth;

    if (sheetRekod) {
      var dataRekod = sheetRekod.getDataRange().getValues();
      var now = new Date();

      for (var j = 1; j < dataRekod.length; j++) {
        var r = dataRekod[j];
        if (r[0] && r[1]) {
          var rawDate = parseFlexibleDate(r[0]);
          if (!rawDate) continue;
          var dateFormatted = Utilities.formatDate(rawDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
          var timeFormatted = Utilities.formatDate(rawDate, Session.getScriptTimeZone(), "HH:mm:ss");
          var id = String(r[1]).trim();
          var nama = String(r[2] || '').trim();
          var kelas = String(r[3] || '').trim();
          var status = String(r[4] || '').trim().toUpperCase();
          var punca = String(r[5] || '').trim();

          // Kira status lewat/tak guna cutoff (dari settings) untuk SERAGAM
          var hours = rawDate.getHours();
          var mins = rawDate.getMinutes();
          var isLateByTime = (hours * 60 + mins) >= cutoffMinSelasa;

          // Sahkan semula status berdasarkan masa & punca
          var isLewat;
          if (status === "HADIR") {
            isLewat = false;
          } else if (status === "LEWAT") {
            isLewat = true;
          } else {
            // Rekod lama tanpa status: fallback ikut masa
            isLewat = isLateByTime;
          }

          // Rekod hari ini: tandakan murid telah scan
          if (dateFormatted === todayStr) {
            if (muridMap[id]) {
              muridMap[id].waktuHariIni = timeFormatted;
              muridMap[id].tarikhLewat = dateFormatted;
              if (isLewat || punca !== "Tepat Masa") {
                muridMap[id].lewatHariIni = true;
                muridMap[id].punca = punca;
              }
            }
          }

          if (isLewat) {
            // Tambah kiraan kelewatan murid
            if (muridMap[id]) {
              muridMap[id].kiraan += 1;
              muridMap[id].punca = punca;

              // Pembahagian kes ikut tempoh
              if (rawDate >= startOfThisWeek) {
                muridMap[id].kesMingguIni += 1;
              } else if (rawDate >= startOfLastWeek) {
                muridMap[id].kesMingguLepas += 1;
              }
              if (rawDate >= startOfThisMonth) {
                muridMap[id].kesBulanIni += 1;
              } else if (rawDate >= startOfLastMonth && rawDate < endOfLastMonth) {
                muridMap[id].kesBulanLepas += 1;
              }
            }

            // Slot Waktu Kelewatan (hari ini sahaja)
            if (dateFormatted === todayStr) {
              var totalMins = hours * 60 + mins;
              if (totalMins < 7 * 60 + 40) {
                slotWaktu[0]++;
              } else if (totalMins <= 7 * 60 + 50) {
                slotWaktu[1]++;
              } else if (totalMins <= 8 * 60) {
                slotWaktu[2]++;
              } else {
                slotWaktu[3]++;
              }
            }

            // Trend Mingguan Kelewatan (6 minggu)
            var diffDays = Math.floor((now - rawDate) / (1000 * 60 * 60 * 24));
            if (diffDays >= 0 && diffDays < 42) {
              var weekIndex = 5 - Math.floor(diffDays / 7);
              if (weekIndex >= 0 && weekIndex < 6) {
                trendMingguan[weekIndex]++;
              }
            }
          }

          rekodList.push({
            tarikhMasa: Utilities.formatDate(rawDate, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss"),
            id: id,
            nama: nama,
            kelas: kelas,
            status: isLewat ? "LEWAT" : "HADIR",
            punca: punca,
            guru: String(r[6] || '').trim(),
            kekerapan: muridMap[id] ? muridMap[id].kiraan : 0
          });
        }
      }
    }

    // Kira jumlah LEWAT hari ini (untuk KPI)
    var lewatHariIni = 0;
    muridList.forEach(function (m) {
      if (m.lewatHariIni) lewatHariIni++;
    });

    // C. RESPONS LENGKAP
    var response = {
      status: "Success",
      totalSasaran: muridList.length,
      lewatHariIni: lewatHariIni,
      slotWaktu: slotWaktu,
      trendMingguan: trendMingguan,
      muridList: muridList,
      rekodList: rekodList,
      streakList: []
    };

    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return jsonResponse({ status: "Error", message: err.toString() });
  }
}

// ============================================================
// 2. MENYIMPAN REKOD IMBASAN KE TAB 'Rekod'
//    Lajur: [Tarikh/Masa, ID, Nama, Kelas, Status, Punca, Guru]
// ============================================================
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    // PENGAWAL KESELAMATAN: Semak API key (daripada query string atau body).
    var requestDataAwal = {};
    if (e.postData && e.postData.contents) {
      try { requestDataAwal = JSON.parse(e.postData.contents); } catch (err) { requestDataAwal = {}; }
    }
    var bodyKey = String(requestDataAwal.apiKey || '');
    var queryKey = String((e.parameter && e.parameter.apiKey) || '');
    var effectiveKey = bodyKey !== '' ? bodyKey : queryKey;
    if (effectiveKey === '' || effectiveKey !== API_KEY) {
      return ContentService.createTextOutput(JSON.stringify({ result: "error", message: "Unauthorized: API key tidak sah." }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Rekod");

    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({ result: "error", message: "Tab 'Rekod' tidak dijumpai!" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var requestData = requestDataAwal;

    // FUNGSI SIMPAN REKOD INTERVENSI (tracking surat/kaunseling)
    // Body: { action:"saveIntervensi", id, status, tarikh, nota }
    if (String(requestData.action || '') === 'saveIntervensi') {
      var dvId = String(requestData.id || '').trim();
      if (dvId === '') {
        return ContentService.createTextOutput(JSON.stringify({ result: "error", message: "ID murid diperlukan." }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      writeIntervensi(dvId, {
        status: String(requestData.status || 'Belum'),
        tarikh: String(requestData.tarikh || ''),
        nota: String(requestData.nota || '')
      });
      return ContentService.createTextOutput(JSON.stringify({ result: "success", id: dvId }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var timestamp = new Date();
    var scanId = String(requestData.id || '').trim();
    var scanName = String(requestData.nama || '').trim();

    // Sahkan semula status berdasarkan masa (cutoff dari settings)
    var statusKehadiran = String(requestData.status || 'LEWAT').trim().toUpperCase();
    if (statusKehadiran === 'HADIR' || statusKehadiran === 'LEWAT') {
      // kekalkan status dari frontend
    } else {
      var hrs = timestamp.getHours();
      var mnt = timestamp.getMinutes();
      var sMin = getSettings().cutoffMin;
      statusKehadiran = (hrs * 60 + mnt) >= sMin ? 'LEWAT' : 'HADIR';
    }

    // CEGAH DUPLIKAT: Semak jika id ini sudah ada dalam tab Rekod pada hari yang sama.
    // Ini menghalang rekod berganda walaupun imbasan datang dari lebih satu peranti
    // atau antrian offline dihantar semula.
    if (scanId !== '') {
      var todayKey = Utilities.formatDate(timestamp, Session.getScriptTimeZone(), "yyyy-MM-dd");
      var existingRows = sheet.getDataRange().getValues();
      for (var di = 1; di < existingRows.length; di++) {
        var dRow = existingRows[di];
        if (!dRow[0] && !dRow[1]) continue;
        var dParsed = parseFlexibleDate(dRow[0]);
        if (!dParsed) continue;
        var dStr = Utilities.formatDate(dParsed, Session.getScriptTimeZone(), "yyyy-MM-dd");
        if (dStr === todayKey && String(dRow[1] || '').trim() === scanId) {
          return ContentService.createTextOutput(JSON.stringify({
            result: "duplicate",
            message: "Rekod imbas murid ini untuk hari ini sudah wujud. Tidak disimpan dua kali.",
            id: scanId
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }
    }

    // Menyimpan mengikut lajur: [Tarikh/Masa, ID, Nama, Kelas, Status, Punca, Guru]
    sheet.appendRow([
      timestamp,
      requestData.id || '',
      requestData.nama || '',
      requestData.kelas || '',
      statusKehadiran,
      requestData.punca || '',
      requestData.guru || ''
    ]);

    return ContentService.createTextOutput(JSON.stringify({ result: "success" }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ result: "error", error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// HELPER: Respons JSON
// ============================================================
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// AUTO RESET STREAK MINGGUAN
// NOTA: Fungsi ini memerlukan lajur "Streak" yang berasingan.
//       Jika tiada, sila tambah lajur bertanda "Streak" dalam
//       tab Rekod ATAU cipta mekanisme reset yang sesuai.
// ============================================================
function autoResetStreakMingguan() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Rekod");

  if (!sheet) return;

  // Cari indeks lajur "Streak" dalam header
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var streakCol = -1;
  for (var c = 0; c < header.length; c++) {
    if (String(header[c]).trim().toLowerCase() === "streak") {
      streakCol = c + 1;
      break;
    }
  }

  if (streakCol === -1) {
    Logger.log("Tiada lajur 'Streak' dijumpai. Sila tambah lajur bertajuk 'Streak'.");
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, streakCol, lastRow - 1, 1).setValue(0);
  }

  Logger.log("Berjaya reset streak mingguan (Lajur " + streakCol + ").");
}

// ============================================================
// PANEL PENTADBIR (Sidebar dalam Google Sheets)
// Menu Q-TIBA > Panel Pentadbir untuk urus tetapan (cuti/cutoff)
// dan senarai murid sasaran tanpa menulis kod.
// ============================================================
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu("Q-TIBA")
    .addItem("Panel Pentadbir", "showPanel")
    .addToUi();
}

function showPanel() {
  var html = HtmlService.createHtmlOutputFromFile("Panel")
    .setTitle("Q-TIBA Panel Pentadbir")
    .setWidth(380);
  SpreadsheetApp.getUi().showSidebar(html);
}

// Bina rentetan senarai cuti (satu baris setiap cuti) daripada objek settings.
function buildCutiString(settings) {
  var lines = [];
  for (var i = 0; i < settings.cuti.length; i++) {
    var c = settings.cuti[i];
    if (c.tarikh) {
      lines.push(c.tarikh + "|" + c.nama);
    } else if (c.mulai) {
      lines.push(c.mulai + ":" + c.akhir + "|" + c.nama);
    }
  }
  return lines.join("\n");
}

function defaultCutiString() {
  return buildCutiString(getSettings());
}

// Ambil senarai murid sasaran daripada tab MuridSasaran.
function readMuridRows() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("MuridSasaran");
  var out = [];
  if (!sheet) return out;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    out.push({
      id: String(data[i][0]).trim(),
      nama: String(data[i][1] || "").trim(),
      kelas: String(data[i][2] || "").trim(),
      urlGambar: String(data[i][3] || "").trim()
    });
  }
  return out;
}

// Data awal untuk muatkan UI panel.
function getPanelData() {
  var settings = getSettings();
  return {
    cutoff: settings.cutoff,
    hujung: settings.hujungMinggu,
    cutiString: buildCutiString(settings),
    murid: readMuridRows()
  };
}

function getPanelMurid() {
  return { murid: readMuridRows() };
}

// Simpan tetapan (cuti/cutoff/hujung minggu) ke tab Tetapan.
function savePanelSettings(params) {
  params = params || {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tab = ss.getSheetByName("Tetapan");
  if (!tab) tab = ss.insertSheet("Tetapan");

  if (tab.getLastRow() > 0) {
    tab.getRange(1, 1, tab.getLastRow(), 2).clearContent();
  }

  tab.getRange(1, 1).setValue("cutoff");
  tab.getRange(1, 2).setValue(String(params.cutoff || "07:21").trim());

  tab.getRange(2, 1).setValue("hujung");
  tab.getRange(2, 2).setValue((params.hujung || [0, 6]).join(","));

  tab.getRange(3, 1).setValue("cuti");
  tab.getRange(3, 2).setValue(String(params.cuti || "").trim());

  // Sahkan cutoff format.
  var c = String(params.cutoff || "").trim();
  if (!/^\d{1,2}:\d{2}$/.test(c)) {
    return { ok: false, msg: "Format cutoff tidak sah. Guna HH:MM (cth 07:21)." };
  }

  return { ok: true, msg: "Tetapan berjaya disimpan." };
}

// Tambah / kemas kini murid.
function savePanelMurid(params) {
  params = params || {};
  var id = String(params.id || "").trim();
  var nama = String(params.nama || "").trim();
  var kelas = String(params.kelas || "").trim();
  var url = String(params.urlGambar || "").trim();
  var editingId = String(params.editingId || "").trim();

  if (!id || !nama) return { ok: false, msg: "ID dan Nama wajib diisi." };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("MuridSasaran");
  if (!sheet) sheet = ss.insertSheet("MuridSasaran");

  var data = sheet.getDataRange().getValues();
  var headerAda = data.length > 0 && String(data[0][0] || "").trim() !== "" && isNaN(Number(String(data[0][0]).trim()));

  if (editingId !== "") {
    // Kemas kini baris sedia ada.
    var targetIdx = -1;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0] || "").trim() === editingId) { targetIdx = i; break; }
    }
    if (targetIdx === -1) return { ok: false, msg: "Murid asal tidak dijumpai." };
    // Cek konflik ID (selain baris yang sedang diedit).
    for (var j = 1; j < data.length; j++) {
      if (j !== targetIdx && String(data[j][0] || "").trim() === id) {
        return { ok: false, msg: "ID yang sama sudah wujud untuk murid lain." };
      }
    }
    sheet.getRange(targetIdx + 1, 1).setValue(id);
    sheet.getRange(targetIdx + 1, 2).setValue(nama);
    sheet.getRange(targetIdx + 1, 3).setValue(kelas);
    sheet.getRange(targetIdx + 1, 4).setValue(url);
    return { ok: true, msg: "Murid dikemas kini." };
  }

  // Tambah baharu.
  for (var k = 1; k < data.length; k++) {
    if (String(data[k][0] || "").trim() === id) {
      return { ok: false, msg: "ID murid ini sudah wujud." };
    }
  }
  var row = [id, nama, kelas, url];
  // Pastikan baris 1 adalah header (sistem membaca data dari baris 2 dan seterusnya).
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 4).setValues([["ID", "Nama", "Kelas", "UrlGambar"]]);
    sheet.getRange(2, 1, 1, 4).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
  return { ok: true, msg: "Murid baharu ditambah." };
}

// Padam murid.
function deletePanelMurid(params) {
  var id = String((params && params.id) || "").trim();
  if (!id) return { ok: false, msg: "ID tidak sah." };
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("MuridSasaran");
  if (!sheet) return { ok: false, msg: "Tab MuridSasaran tidak dijumpai." };
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || "").trim() === id) {
      sheet.deleteRow(i + 1);
      return { ok: true, msg: "Murid telah dipadam." };
    }
  }
  return { ok: false, msg: "Murid tidak dijumpai." };
}

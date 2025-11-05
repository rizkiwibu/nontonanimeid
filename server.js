// server.js

// --- Import modul bawaan Node.js dan eksternal
const express = require('express');
const os = require('os');
const process = require('process');
const axios = require('axios'); 
const checkDiskSpace = require('check-disk-space').default; 
// Import Scraper CJS
const { NontonAnimeID } = require('./nontonanimeid'); 

// Inisiasi Scraper
const nonai = new NontonAnimeID();

const app = express();
const PORT = process.env.PORT || 3000; 
const API_PREFIX = '/api';

app.use(express.json());

// ---------------------------------
// Fungsi Pembantu untuk Mendapatkan Spek Server (Sama seperti contoh Anda)
// ---------------------------------
const getServerInfo = async () => {
    // 1. Data Lokal (OS, CPU, RAM, Uptime)
    const totalMemBytes = os.totalmem();
    const freeMemBytes = os.freemem();
    const totalMemGB = (totalMemBytes / (1024 ** 3)).toFixed(2);
    const freeMemGB = (freeMemBytes / (1024 ** 3)).toFixed(2);
    
    // Uptime Server
    const uptimeSeconds = os.uptime();
    const days = Math.floor(uptimeSeconds / (3600 * 24));
    const hours = Math.floor((uptimeSeconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = Math.floor(uptimeSeconds % 60);
    const uptimeFormatted = `${days}d ${hours}h ${minutes}m ${seconds}s`;

    // Penanganan CPU (dengan fallback)
    const cpuInfo = os.cpus();
    const cpuModel = cpuInfo.length > 0 ? cpuInfo[0].model : 'N/A (Details Restricted)';
    const cpuCores = cpuInfo.length > 0 ? cpuInfo.length : 'N/A';
    
    // 2. Data Jaringan Eksternal (IP, ISP)
    let ipInfo = { public_ip: 'N/A (Failed to fetch)', isp: 'N/A (Failed to fetch)', location: 'N/A (Failed to fetch)', api_latency: 'N/A' };
    try {
        const startTime = Date.now();
        const { data } = await axios.get('http://ip-api.com/json', { timeout: 5000 });
        const endTime = Date.now();
        if (data.status === 'success') {
            ipInfo = {
                public_ip: data.query,
                isp: data.isp,
                location: `${data.country} (${data.city})`,
                api_latency: `${endTime - startTime}ms`
            };
        } else { ipInfo.public_ip = `API Error: ${data.message || 'Unknown response status'}`; }
    } catch (e) {
        console.error(`[Health Check] Gagal mengambil data IP/ISP: ${e.message}`);
    }

    // 3. Data Storage/Disk
    let diskInfo = { total_gb: 'N/A', used_gb: 'N/A', free_gb: 'N/A', note: 'Error getting disk space. Attempted: /' };
    try {
        const disk = await checkDiskSpace('/'); 
        diskInfo = {
            total_gb: (disk.size / (1024 ** 3)).toFixed(2),
            used_gb: ((disk.size - disk.free) / (1024 ** 3)).toFixed(2),
            free_gb: (disk.free / (1024 ** 3)).toFixed(2),
            note: 'Data diambil dari root directory (/)',
        };
    } catch (e) {
        try {
            const homePath = os.homedir();
            const disk = await checkDiskSpace(homePath);
            diskInfo = {
                total_gb: (disk.size / (1024 ** 3)).toFixed(2),
                used_gb: ((disk.size - disk.free) / (1024 ** 3)).toFixed(2),
                free_gb: (disk.free / (1024 ** 3)).toFixed(2),
                note: `Data diambil dari home directory (${homePath})`,
            };
        } catch (e) {
            console.error(`[Health Check] Gagal mengambil data disk: ${e.message}`);
            diskInfo.note = 'Gagal mengambil data disk. Pastikan library sudah terinstal dan perizinan sudah diberikan.';
        }
    }

    // 4. Mengembalikan SEMUA data
    return {
        timestamp: new Date().toISOString(),
        runtime_uptime: uptimeFormatted,
        system: {
            os: `${os.type()} ${os.release()} (${os.arch()})`,
            cpu_model: cpuModel, 
            cpu_cores: cpuCores,
        },
        memory: {
            total_gb: totalMemGB,
            used_gb: (totalMemGB - freeMemGB).toFixed(2),
            free_gb: freeMemGB,
            process_mem_mb: (process.memoryUsage().rss / (1024 ** 2)).toFixed(2),
        },
        storage: diskInfo,
        network: ipInfo, 
    };
};
// ---------------------------------
// Root Endpoint & Health Check
// ---------------------------------
app.get('/', (req, res) => {
  res.status(200).json({
    message: "Welcome to the NontonAnimeID Scraper API (CJS)",
    endpoints: {
      "GET /api/home": "Get latest anime and featured data",
      "GET /api/search?q=search_term": "Search for anime by title",
      "GET /api/detail?url=anime_url": "Get detailed information about an anime",
      "GET /api/download?url=episode_url": "Get download links for an episode",
      "GET /health": "Health check with full server specs" 
    },
    scraper_source: nonai.baseUrl
  });
});

app.get('/health', async (req, res) => {
    try {
        const info = await getServerInfo();
        res.status(200).json({ status: 'OK', port: PORT, server_specs: info });
    } catch (error) {
        console.error("Critical Error generating server info:", error);
        res.status(500).json({ 
            status: 'Critical Error', 
            error: 'Terjadi error tak terduga saat mengambil spek server, cek log console.',
            details: error.message
        });
    }
});

// ---------------------------------
// Endpoint Scraper Anime 🎬
// ---------------------------------

// Homepage Data
app.get(`${API_PREFIX}/home`, async (req, res) => {
  try {
    const result = await nonai.home();
    // Mengambil status dari result scraper (default 200 atau 500)
    res.status(result.code || (result.success ? 200 : 500)).json(result);
  } catch (error) {
    console.error("Error on /api/home:", error);
    res.status(500).json({ success: false, error: 'Gagal mengambil data homepage.' });
  }
});

// Search
app.get(`${API_PREFIX}/search`, async (req, res) => {
  const keyword = req.query.q;

  if (!keyword) {
    return res.status(400).json({ success: false, code: 400, error: 'Parameter query "q" wajib diisi untuk pencarian.' });
  }

  try {
    const result = await nonai.search(keyword);
    res.status(result.code || (result.success ? 200 : 500)).json(result);
  } catch (error) {
    console.error("Error on /api/search:", error);
    res.status(500).json({ success: false, error: 'Gagal melakukan pencarian.' });
  }
});

// Detail Anime
app.get(`${API_PREFIX}/detail`, async (req, res) => {
  const animeUrl = req.query.url;

  if (!animeUrl) {
    return res.status(400).json({ success: false, code: 400, error: 'Parameter query "url" wajib diisi.' });
  }

  try {
    const result = await nonai.detail(animeUrl);
    res.status(result.code || (result.success ? 200 : 500)).json(result);
  } catch (error) {
    console.error("Error on /api/detail:", error);
    res.status(500).json({ success: false, error: 'Gagal mengambil detail anime.' });
  }
});

// Download Link
app.get(`${API_PREFIX}/download`, async (req, res) => {
  const episodeUrl = req.query.url;

  if (!episodeUrl) {
    return res.status(400).json({ success: false, code: 400, error: 'Parameter query "url" wajib diisi (URL Episode).' });
  }
  
  try {
    const result = await nonai.download(episodeUrl); 
    res.status(result.code || (result.success ? 200 : 500)).json(result);
  } catch (error) {
    console.error("Error on /api/download:", error);
    res.status(500).json({ success: false, error: 'Gagal mengambil link download.' });
  }
});

// ---------------------------------
// 404 Handler
// ---------------------------------
app.use((req, res) => {
  res.status(404).json({ success: false, code: 404, error: 'Endpoint tidak ditemukan' });
});

// Jalankan server
app.listen(PORT, () => {
  console.log(`🚀 API Server (CJS) berjalan di http://localhost:${PORT}`);
  console.log('Lihat endpoint di /');
});

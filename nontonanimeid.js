// nontonanimeid.js
/**
 * NontonAnimeID Scraper
 * by lang
 * package: axios, cheerio
 */

const axios = require('axios')
const cheerio = require('cheerio')
const fetch = require('node-fetch') // Harus di-require di CommonJS untuk initDownload

class NontonAnimeID {
    constructor() {
        this.baseUrl = 'https://s7.nontonanimeid.boats/'
        this.headers = {
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
        }
    }

    async home() {
        try {
            let { data } = await axios.get(this.baseUrl, { headers: this.headers })
            const $ = cheerio.load(data)
            let result = []
            $('article.animeseries').each((i, el) => {
                result.push({
                    title: $(el).find('h3.title').text().trim(),
                    img: $(el).find('img').attr('src'),
                    eps: $(el).find('.episodes').text().trim(),
                    status: $(el).find('.status').text().trim(),
                    url: $(el).find('a').attr('href') // Tambahkan URL
                })
            })
            return { success: true, code: 200, result };
        } catch (error) {
            console.error("[Scraper Error] home:", error.message);
            return { success: false, code: 500, error: 'Gagal mengambil data home.', details: error.message };
        }
    }

    async search(q) {
        if (!q) return { success: false, code: 400, error: 'Query is required' }
        try {
            let { data } = await axios.get(new URL(`/?s=${q}`, this.baseUrl).toString(), { headers: this.headers })
            const $ = cheerio.load(data)
            let result = []
            $('.icon').remove()
            $('.as-anime-grid a').each((i, el) => {
                result.push({
                    title: $(el).find('.as-anime-title').text().trim(),
                    img: $(el).find('img').attr('src'),
                    rating: $(el).find('.as-rating').text().trim(),
                    type: $(el).find('.as-type').text().trim(),
                    season: $(el).find('.as-season').text().trim(),
                    sypnosis: $(el).find('.as-synopsis').text().trim(),
                    genre: [],
                    url: $(el).attr('href')
                })
                $(el).find('.as-genres span').each((j, el2) => {
                    result[i].genre.push($(el2).text().trim())
                })
            })
            return { success: true, code: 200, result };
        } catch (error) {
            console.error("[Scraper Error] search:", error.message);
            return { success: false, code: 500, error: 'Gagal melakukan pencarian.', details: error.message };
        }
    }

    async detail(url) {
        if (!url) return { success: false, code: 400, error: 'URL is required' }
        try {
            let { data } = await axios.get(url, { headers: this.headers })
            const $ = cheerio.load(data)
            let result = {
                title: $('.anime-card__sidebar img').attr('alt'),
                img: $('.anime-card__sidebar img').attr('src'),
                synopsis: $('.synopsis-prose').text().trim(),
                detail: {},
                genre: [],
                episodes: []
            }
            $('.detail-separator').remove()
            $('.details-list li').each((i, el) => {
                let key = $(el).find('.detail-label').text().replace(':', '').toLowerCase().replace(/\s/g, '_')
                $(el).find('.detail-label').remove()
                let value = $(el).text().trim()
                result.detail[key] = value
            })
            $('.anime-card__genres a').each((i, el) => {
                result.genre.push($(el).text().trim())
            })
            $('.episode-list-items a').each((i, el) => {
                result.episodes.push({
                    eps: $(el).find('.ep-title').text().trim(),
                    date: $(el).find('.ep-date').text().trim(),
                    url: $(el).attr('href')
                })
            })
            return { success: true, code: 200, result };
        } catch (error) {
            console.error("[Scraper Error] detail:", error.message);
            return { success: false, code: 500, error: 'Gagal mengambil detail anime.', details: error.message };
        }
    }

    async download(url) {
        if (!url) return { success: false, code: 400, error: 'URL is required' }
        try {
            let { data: page } = await axios.get(url, { headers: this.headers })
            const $ = cheerio.load(page)
            let lokal = null
            let alternative = []
            $('.listlink a').each((i, el) => {
                if ($(el).text().toLowerCase().includes('lokal')) {
                    lokal = $(el).attr('href')
                } else {
                    alternative.push({
                        server: $(el).text().trim(),
                        url: $(el).attr('href')
                    })
                }
            })
            
            const downloadResult = lokal ? await this.initDownload(lokal) : 'No lokal server found';

            const result = {
                title: $('h1.entry-title').text().trim(),
                date: $('.bottomtitle time').text().trim(),
                download: downloadResult,
                alternative
            }
            return { success: true, code: 200, result };
        } catch (error) {
            console.error("[Scraper Error] download:", error.message);
            return { success: false, code: 500, error: 'Gagal mengambil link download.', details: error.message };
        }
    }


    async initDownload(url) {
        try {
            let { data: token } = await axios.post(`https://s2.kotakanimeid.link/video/get-token.php`, { url }, {
                headers: {
                    'content-type': 'application/json',
                    'origin': this.baseUrl,
                    'referer': url,
                    'x-fingerprint': 'dummy-fingerprint',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
                }
            })
            let { data: html } = await axios.get(url, { headers: this.headers })
            const $ = cheerio.load(html)
            const script = $('script').html()
            const matchEncryptedParam = script.match(/const ENCRYPTED_PARAM = "(.*)";/)
            const matchTitleParam = script.match(/const TITLE_PARAM = "(.*)";/)
            const encryptedParam = matchEncryptedParam[1]
            const titleParam = matchTitleParam ? matchTitleParam[1] : '';
            const requestUrl = new URL('/video/get-download.php', 'https://s2.kotakanimeid.link');
            requestUrl.searchParams.set('mode', 'lokal');
            requestUrl.searchParams.set('vid', encodeURIComponent(encryptedParam));
            if (titleParam) requestUrl.searchParams.set('title', encodeURIComponent(titleParam));
            requestUrl.searchParams.set('dl', 'yes');
            requestUrl.searchParams.set('json', 'true');
            let { data } = await axios.post(requestUrl.toString(), {
                challenge: token.challenge,
                url: requestUrl.toString(),
            }, {
                headers: {
                    'content-type': 'application/json',
                    'origin': this.baseUrl,
                    'referer': url,
                    'x-fingerprint': 'dummy-fingerprint',
                    'x-challenge': token.challenge,
                    'x-security-token': token.token,
                    'x-timestamp': token.timestamp,
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
                }
            })
            let result = []
            for (const [quality, items] of Object.entries(data.links)) {
                result.push({
                    quality,
                    url: 'https://s2.kotakanimeid.link' + items[0].url
                })
            }
            let index = 0
            for (let i of result) {
                let url = i.url
                let res = await fetch(url, {
                    headers: {
                        ...this.headers,
                        referer: url
                    }, redirect: 'manual'
                })
                result[index].url = res.headers.get('location')
                index++
            }
            return result
        } catch (error) {
            console.error("[Scraper Error] initDownload:", error.message);
            return { error: 'Gagal mendapatkan link akhir dari server lokal.', details: error.message };
        }
    }
}

// Ekspor Kelas untuk digunakan di server.js
module.exports = {
    NontonAnimeID
};

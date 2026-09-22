import puppeteer from 'puppeteer-core';

async function main() {
    const browser = await puppeteer.launch({
        executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        headless: true,
        defaultViewport: { width: 1440, height: 1100 }
    });

    try {
        const page = await browser.newPage();
        await page.goto('http://localhost:20140/studio/video-to-video.html', { waitUntil: 'networkidle0' });

        await page.waitForSelector('#v2v-project-select');
        
        // Select project gtf_mu0mxlk6_501637
        await page.select('#v2v-project-select', 'gtf_mu0mxlk6_501637');
        await new Promise(r => setTimeout(r, 1200));

        const shotPath = 'C:\\Users\\gifft\\.gemini\\antigravity\\brain\\8a7ad38d-744f-4d83-bdc3-489fdcef30e0\\scratch\\fixed_ref_analysis.png';
        await page.screenshot({ 
            path: shotPath,
            fullPage: false
        });
        console.log('Saved ' + shotPath);

    } finally {
        await browser.close();
    }
}

main().catch(console.error);

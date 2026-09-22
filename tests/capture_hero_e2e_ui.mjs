import puppeteer from 'puppeteer-core';
import path from 'path';

async function main() {
    const browser = await puppeteer.launch({
        executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        headless: true,
        defaultViewport: { width: 1440, height: 1100 }
    });

    try {
        const page = await browser.newPage();
        await page.goto('http://localhost:20140/studio/video-to-video.html', { waitUntil: 'networkidle0' });

        // Wait for select element to have projects
        await page.waitForSelector('#v2v-project-select');
        
        // Select project gtf_mu0mloi8_80a4d0
        await page.select('#v2v-project-select', 'gtf_mu0mloi8_80a4d0');
        await new Promise(r => setTimeout(r, 1500));

        // Screenshot 1: Full top workspace view showing project, stepper, competitor analysis & video output
        const shotPath1 = 'C:\\Users\\gifft\\.gemini\\antigravity\\brain\\8a7ad38d-744f-4d83-bdc3-489fdcef30e0\\scratch\\hero_e2e_workspace.png';
        await page.screenshot({ 
            path: shotPath1,
            fullPage: false
        });
        console.log('Saved ' + shotPath1);

        // Scroll down to see the timeline & script table
        await page.evaluate(() => {
            window.scrollBy(0, 750);
        });
        await new Promise(r => setTimeout(r, 600));

        // Screenshot 2: Scrolled view showing timeline table with scenes and voiceover
        const shotPath2 = 'C:\\Users\\gifft\\.gemini\\antigravity\\brain\\8a7ad38d-744f-4d83-bdc3-489fdcef30e0\\scratch\\hero_e2e_timeline.png';
        await page.screenshot({ 
            path: shotPath2,
            fullPage: false
        });
        console.log('Saved ' + shotPath2);

    } finally {
        await browser.close();
    }
}

main().catch(console.error);

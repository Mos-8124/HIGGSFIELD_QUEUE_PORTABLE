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

        // Scroll down to library
        await page.evaluate(() => {
            const el = document.getElementById('v2v-library');
            if (el) el.scrollIntoView();
        });
        await new Promise(r => setTimeout(r, 1000));

        // Screenshot 1: Library grid showing 24/24 described
        const shot1 = 'C:\\Users\\gifft\\.gemini\\antigravity\\brain\\8a7ad38d-744f-4d83-bdc3-489fdcef30e0\\scratch\\ui_library_all_described.png';
        await page.screenshot({ path: shot1, fullPage: false });
        console.log('Saved ' + shot1);

        // Click on asset VID_45718e2e3e (which was previously undescribed)
        const btn = await page.$('.v2v-asset[data-id="VID_45718e2e3e"] [data-open]');
        if (btn) {
            await btn.click();
            await new Promise(r => setTimeout(r, 1200));

            // Screenshot 2: Modal of VID_45718e2e3e showing clean events table
            const shot2 = 'C:\\Users\\gifft\\.gemini\\antigravity\\brain\\8a7ad38d-744f-4d83-bdc3-489fdcef30e0\\scratch\\ui_modal_clean_description.png';
            await page.screenshot({ path: shot2, fullPage: false });
            console.log('Saved ' + shot2);
        }

    } finally {
        await browser.close();
    }
}

main().catch(console.error);

import fs from 'fs';
import path from 'path';
import { calculateKieQuote, KIE_CREDIT_USD_RATE } from './kie_pricing.js';

const USAGE_FILE = path.join(process.cwd(), 'byteplus_usage.json');

export class UsageManager {
    constructor(filePath = USAGE_FILE) {
        this.filePath = filePath;
        this.records = [];
        this.load();
    }

    load() {
        try {
            if (fs.existsSync(this.filePath)) {
                const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
                this.records = Array.isArray(data.records) ? data.records : [];
            }
        } catch (err) {
            console.error('Lỗi đọc byteplus_usage.json', err);
        }
    }

    save() {
        try {
            fs.writeFileSync(this.filePath, JSON.stringify({
                records: this.records
            }, null, 2));
        } catch (err) {
            console.error('Lỗi lưu byteplus_usage.json', err);
        }
    }

    /**
     * Ghi nhận hoặc cập nhật thông tin chi phí task.
     * TUYỆT ĐỐI KHÔNG BỊA actualCredits nếu provider không trả về.
     */
    recordTask(task, { actualCredits = null, status = null } = {}) {
        if (!task || !task.id) return null;

        const taskId = task.id;
        let record = this.records.find(r => r.taskId === taskId);
        const quote = task.quote || calculateKieQuote({
            resolution: task.resolution || (record && record.resolution) || '720p',
            outputDuration: Number(task.duration) || Number(task.outputDuration) || (record && record.outputDuration) || 4,
            inputVideoDuration: Number(task.inputVideoDuration) || (record && record.inputVideoDuration) || 0
        });

        // Xử lý actualCredits: CHỈ lấy từ Kie creditsConsumed thật sự
        let actCredits = null;
        if (Number.isFinite(actualCredits)) {
            actCredits = Number(actualCredits);
        } else if (task.billing && Number.isFinite(task.billing.creditsConsumed)) {
            actCredits = Number(task.billing.creditsConsumed);
        }

        const estCredits = quote && Number.isFinite(quote.credits) ? Number(quote.credits) : null;
        const estUsd = estCredits !== null ? Number((estCredits * KIE_CREDIT_USD_RATE).toFixed(4)) : null;
        const actUsd = actCredits !== null ? Number((actCredits * KIE_CREDIT_USD_RATE).toFixed(4)) : null;

        const recordStatus = status || task.status || 'completed';

        if (!record) {
            record = {
                time: new Date().toISOString(),
                creator: task.creator || 'Unknown',
                taskName: task.taskName || taskId,
                taskId,
                model: (task.billing && task.billing.model) || task.model || 'bytedance/seedance-2-5',
                resolution: (quote && quote.resolution) || task.resolution || '720p',
                outputDuration: (quote && quote.outputDuration) || Number(task.duration) || 4,
                inputVideoDuration: (quote && quote.inputVideoDuration) || Number(task.inputVideoDuration) || 0,
                estimatedCredits: estCredits,
                actualCredits: actCredits,
                estimatedUsd: estUsd,
                actualUsd: actUsd,
                status: recordStatus
            };
            this.records.push(record);
        } else {
            if (task.creator) record.creator = task.creator;
            if (task.taskName) record.taskName = task.taskName;
            if (task.resolution) record.resolution = task.resolution;
            if (task.duration) record.outputDuration = Number(task.duration);
            if (task.inputVideoDuration !== undefined) record.inputVideoDuration = Number(task.inputVideoDuration);
            if (estCredits !== null) record.estimatedCredits = estCredits;
            if (estUsd !== null) record.estimatedUsd = estUsd;
            if (actCredits !== null) {
                record.actualCredits = actCredits;
                record.actualUsd = actUsd;
            }
            record.status = recordStatus;
            record.updatedAt = new Date().toISOString();
        }

        this.save();
        return record;
    }

    /** Alias backward compatibility */
    recordUsage(taskId, quote, actualCredits) {
        return this.recordTask(
            { id: taskId, quote, taskName: taskId, creator: 'User' },
            { actualCredits: Number.isFinite(actualCredits) ? actualCredits : null }
        );
    }

    getSummary({ realBalance = null } = {}) {
        // Tổng credits đã tiêu chỉ tính từ các task có actualCredits thật
        const totalActualCredits = this.records.reduce((acc, r) => {
            return r.actualCredits !== null && Number.isFinite(r.actualCredits) ? acc + r.actualCredits : acc;
        }, 0);

        return {
            realBalance: realBalance !== null ? Number(realBalance) : null,
            totalConsumed: totalActualCredits,
            totalUsd: Number((totalActualCredits * KIE_CREDIT_USD_RATE).toFixed(4)),
            records: this.records.slice().reverse()
        };
    }

    clear() {
        this.records = [];
        this.save();
    }
}

export const usageManager = new UsageManager();

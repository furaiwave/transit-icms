export class RollingStats {
    private readonly window: number[] = []
    constructor(private readonly size: number) {}

    get count(): number {
        return this.window.length
    }

    push(value: number): void {
        this.window.push(value);
        if(this.window.length > this.size) this.window.shift()
    }

    get mean(): number {
        if(this.window.length === 0) return 0
        return this.window.reduce((a, b) => a + b, 0)/ this.window.length
    }

    get std(): number {
        if(this.window.length < 2) return 0
        const m = this.mean
        const variance = this.window.reduce((acc, v) => acc + (v - m) ** 2, 0) / (this.window.length - 1)
        return Math.sqrt(variance)
    }

    zScore(value: number): number {
        const std = this.std
        if(std < 1e-6) return 0
        return (value - this.mean) / std
    }
}
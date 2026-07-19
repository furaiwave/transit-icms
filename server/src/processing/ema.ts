export class Ema {
    private value: number | null = null

    constructor(private readonly alpha: number) {}

    push(x: number): number {
        this.value = this.value === null ? x : this.alpha * x + (1 - this.alpha) * this.value
        return this.value
    }

    get current(): number {
        return this.value ?? 0
    }
}
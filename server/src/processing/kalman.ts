export class Kalman1D {
    private x: number
    private v = 0
    private p00 = 1
    private p01 = 0
    private p10 = 0
    private p11 = 1

    constructor(x0: number, private readonly q: number, private readonly r: number){
        this.x = x0
    }

    get position(): number {
        return this.x
    }

    predict(dtSeconds: number): number {
        const dt = Math.max(0.05, dtSeconds)
        this.x += this.v * dt
        this.p00 += dt * (this.p10 + this.p01) + dt * dt * this.p11 + this.q * dt
        this.p01 += dt * this.p11
        this.p10 += dt * this.p11
        this.p11 += this.q * dt
        return this.x
    }

    update(z: number): number {
        const innovation = z - this.x
        const s = this.p00 + this.r
        const k0 = this.p00 / s
        const k1 = this.p10 / s
        this.x += k0 * innovation
        this.v += k1 * innovation
        const p00 = this.p00
        const p01 = this.p01
        this.p00 = (1 - k0) * p00
        this.p01 = (1 - k0) * p01
        return this.x
    }
}
/** Знімок одного такту фільтра — числовий приклад для звіту (табл. 2.2). */
export interface KalmanStep {
    readonly dt: number
    /** Апріорна оцінка після predict */
    readonly predicted: number
    /** Вимірювання */
    readonly measured: number
    /** Інновація z − x⁻ */
    readonly innovation: number
    /** Коефіцієнт підсилення за координатою */
    readonly gainPosition: number
    /** Коефіцієнт підсилення за швидкістю */
    readonly gainVelocity: number
    /** Апостеріорна оцінка після update */
    readonly corrected: number
    /** Дисперсія координати до / після корекції */
    readonly pBefore: number
    readonly pAfter: number
}

export class Kalman1D {
    private x: number
    private v = 0
    private p00 = 1
    private p01 = 0
    private p10 = 0
    private p11 = 1
    private dtLast = 0
    private predictedLast = 0
    private step: KalmanStep | null = null

    constructor(x0: number, private readonly q: number, private readonly r: number){
        this.x = x0
    }

    get position(): number {
        return this.x
    }

    get velocity(): number {
        return this.v
    }

    /** Останній виконаний такт predict+update, або null якщо update ще не було. */
    get lastStep(): KalmanStep | null {
        return this.step
    }

    predict(dtSeconds: number): number {
        const dt = Math.max(0.05, dtSeconds)
        this.dtLast = dt
        this.x += this.v * dt
        this.p00 += dt * (this.p10 + this.p01) + dt * dt * this.p11 + this.q * dt
        this.p01 += dt * this.p11
        this.p10 += dt * this.p11
        this.p11 += this.q * dt
        this.predictedLast = this.x
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
        this.p10 -= k1 * p00
        this.p11 -= k1 * p01
        this.step = {
            dt: this.dtLast,
            predicted: this.predictedLast,
            measured: z,
            innovation,
            gainPosition: k0,
            gainVelocity: k1,
            corrected: this.x,
            pBefore: p00,
            pAfter: this.p00,
        }
        return this.x
    }
}
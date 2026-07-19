export const ParseCSV = <const H extends readonly string[]>(
    text: string,
    required: H,
): ReadonlyArray<Record<H[number], string>> => {
    const rows = splitRows(text.replace(/^\uFEFF/, ''))
    const header = rows[0]
    if(!header) return []
    const index = new Map(header.map((name, i) => [name.trim(), i] as const))
    for(const col of required){
        if(!index.has(col)) throw new Error(`GTFS: відсутня колонка "${col}"`)
    }
    return rows.slice(1).filter((r) => r.length > 1 || (r[0] ?? '') !== '').map((cells) => {
        const record = {} as Record<H[number], string>
        for(const col of required) {
            const i = index.get(col)
            record[col as H[number]] = i === undefined ? '' : (cells[i] ?? '').trim()
        }
        return record
    })
}

const splitRows = (text: string): string[][] => {
    const rows: string[][] = []
    let cell = ''
    let row: string[] = []
    let quoted = false
    for(let i = 0; i < text.length; i += 1){
        const ch = text[i]
        if(quoted){
            if(ch === '"' && text[i + 1] === '"'){
                cell += '"'
                i += 1
            } else if (ch === '"'){
                quoted = false
            } else {
                cell += ch
            }
        } else if(ch === '"'){
            quoted = true
        } else if (ch === ','){
            row.push(cell)
            cell = ''
        } else if (ch === '\n' || ch === '\r'){
            if(ch === '\r' && text[i + 1] === '\n') i += 1
            row.push(cell)
            rows.push(row)
            row = []
            cell = ''
        } else { 
            cell += ch
        }
    }
    if(cell != '' || row.length > 0) {
        row.push(cell)
        rows.push(row)
    }
    return rows
}
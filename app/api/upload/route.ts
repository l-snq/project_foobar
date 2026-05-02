import type { NextRequest } from 'next/server'
import { writeFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { join } from 'path'

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB
const ALLOWED_EXTENSIONS = new Set(['gltf', 'glb'])

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file || typeof file.name !== 'string') {
      return Response.json({ error: 'No file provided' }, { status: 400 })
    }

    const nameParts = file.name.split('.')
    const ext = nameParts.length > 1 ? nameParts[nameParts.length - 1].toLowerCase() : ''

    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return Response.json(
        { error: 'Invalid file type. Only .gltf and .glb files are accepted.' },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return Response.json(
        { error: 'File too large. Maximum size is 20MB.' },
        { status: 413 }
      )
    }

    const filename = `${randomUUID()}.${ext}`
    const savePath = join(process.cwd(), 'public', 'uploads', filename)
    const buffer = Buffer.from(await file.arrayBuffer())

    await writeFile(savePath, buffer)

    return Response.json({ url: `/uploads/${filename}` })
  } catch (err) {
    console.error('Upload error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

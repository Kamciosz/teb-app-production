import React, { useMemo, useRef, useState } from 'react'
import Cropper from 'react-easy-crop'
import imageCompression from 'browser-image-compression'
import { Camera, Loader2, Plus, X, ZoomIn } from 'lucide-react'
import { ImageKitService } from '../../services/imageKitService'
import { sanitizeImageUrl } from '../../utils/safeContent'

async function loadImage(src) {
    return new Promise((resolve, reject) => {
        const image = new Image()
        image.addEventListener('load', () => resolve(image))
        image.addEventListener('error', reject)
        image.src = src
    })
}

async function getCroppedAvatarBlob(imageSrc, croppedAreaPixels) {
    const image = await loadImage(imageSrc)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const size = 512

    canvas.width = size
    canvas.height = size

    ctx.drawImage(
        image,
        croppedAreaPixels.x,
        croppedAreaPixels.y,
        croppedAreaPixels.width,
        croppedAreaPixels.height,
        0,
        0,
        size,
        size
    )

    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (!blob) {
                reject(new Error('Nie udalo sie przygotowac avatara.'))
                return
            }
            resolve(blob)
        }, 'image/webp', 0.88)
    })
}

export default function AvatarEditorModal({ isOpen, onClose, currentAvatarUrl, onSaved }) {
    const fileInputRef = useRef(null)
    const [sourceUrl, setSourceUrl] = useState('')
    const [crop, setCrop] = useState({ x: 0, y: 0 })
    const [zoom, setZoom] = useState(1)
    const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const previewUrl = useMemo(() => sanitizeImageUrl(currentAvatarUrl), [currentAvatarUrl])

    if (!isOpen) return null

    async function handleFileChange(event) {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return

        if (!file.type.startsWith('image/')) {
            setError('Mozesz wybrac tylko plik graficzny.')
            return
        }

        setError('')

        try {
            const preparedFile = await imageCompression(file, {
                maxSizeMB: 1,
                maxWidthOrHeight: 1920,
                useWebWorker: false,
                initialQuality: 0.9
            })

            const nextUrl = URL.createObjectURL(preparedFile)
            setSourceUrl(previous => {
                if (previous) URL.revokeObjectURL(previous)
                return nextUrl
            })
            setCrop({ x: 0, y: 0 })
            setZoom(1)
        } catch (uploadError) {
            console.error(uploadError)
            setError('Nie udalo sie przygotowac zdjecia do edycji.')
        }
    }

    async function handleSave() {
        if (!sourceUrl || !croppedAreaPixels || saving) return

        setSaving(true)
        setError('')

        try {
            const blob = await getCroppedAvatarBlob(sourceUrl, croppedAreaPixels)
            const file = new File([blob], `avatar_${Date.now()}.webp`, { type: 'image/webp' })
            const uploadedUrl = await ImageKitService.upload(file, file.name, 'profiles')
            await onSaved(uploadedUrl)
        } catch (saveError) {
            console.error(saveError)
            setError(saveError?.message || 'Nie udalo sie zapisac avatara.')
        } finally {
            setSaving(false)
        }
    }

    function closeModal() {
        setError('')
        setZoom(1)
        setCrop({ x: 0, y: 0 })
        setSourceUrl(previous => {
            if (previous) URL.revokeObjectURL(previous)
            return ''
        })
        onClose()
    }

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[120] flex items-center justify-center p-4">
            <div className="bg-surface border border-gray-700 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between bg-[#1a1a1a]">
                    <div>
                        <div className="text-lg font-bold text-white">Edytuj avatar</div>
                        <div className="text-[11px] text-gray-500 mt-1">Przesun i przybliz zdjecie przed zapisem.</div>
                    </div>
                    <button onClick={closeModal} className="p-2 text-gray-500 hover:text-white transition">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-5 space-y-5">
                    <div className="flex items-center gap-4">
                        <div className="w-20 h-20 rounded-full overflow-hidden border border-gray-700 bg-background shrink-0">
                            {sourceUrl ? (
                                <img src={sourceUrl} alt="Podglad" className="w-full h-full object-cover" />
                            ) : previewUrl ? (
                                <img src={previewUrl} alt="Aktualny avatar" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-600">
                                    <Camera size={28} />
                                </div>
                            )}
                        </div>

                        <div className="flex-1">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleFileChange}
                                style={{ display: 'none' }}
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full rounded-2xl border border-primary/30 bg-primary/10 text-primary font-bold py-3 px-4 flex items-center justify-center gap-2 hover:bg-primary/15 transition"
                            >
                                <Plus size={16} /> Wybierz zdjecie
                            </button>
                            <div className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                                Avatar pozostaje kwadratowy 1:1, ale mozesz ustawic kadr i przyblizenie.
                            </div>
                        </div>
                    </div>

                    <div className="rounded-3xl border border-gray-800 bg-background overflow-hidden">
                        {sourceUrl ? (
                            <>
                                <div className="relative h-72 bg-black">
                                    <Cropper
                                        image={sourceUrl}
                                        crop={crop}
                                        zoom={zoom}
                                        aspect={1}
                                        cropShape="round"
                                        showGrid={false}
                                        restrictPosition={false}
                                        onCropChange={setCrop}
                                        onZoomChange={setZoom}
                                        onCropComplete={(_, croppedPixels) => setCroppedAreaPixels(croppedPixels)}
                                    />
                                </div>

                                <div className="p-4 border-t border-gray-800 space-y-3">
                                    <div className="flex items-center justify-between text-xs font-bold text-gray-400 uppercase">
                                        <span>Przyblizenie</span>
                                        <span className="text-primary flex items-center gap-1"><ZoomIn size={12} /> {zoom.toFixed(1)}x</span>
                                    </div>
                                    <input
                                        type="range"
                                        min={1}
                                        max={3}
                                        step={0.1}
                                        value={zoom}
                                        onChange={event => setZoom(Number(event.target.value))}
                                        className="w-full accent-blue-500"
                                    />
                                </div>
                            </>
                        ) : (
                            <div className="h-72 flex flex-col items-center justify-center text-center px-6">
                                <Camera size={34} className="text-gray-700 mb-3" />
                                <div className="text-sm font-bold text-white">Najpierw wybierz zdjecie</div>
                                <div className="text-xs text-gray-500 mt-2 leading-relaxed">Po wyborze zdjecia ustawisz pozycje i przyblizenie avatara.</div>
                            </div>
                        )}
                    </div>

                    {error && <div className="text-sm text-red-400">{error}</div>}

                    <div className="flex gap-3">
                        <button onClick={closeModal} className="flex-1 py-3 rounded-2xl bg-background border border-gray-700 text-gray-300 font-bold hover:text-white transition">
                            Anuluj
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!sourceUrl || saving}
                            className="flex-1 py-3 rounded-2xl bg-primary text-white font-bold disabled:opacity-40 flex items-center justify-center gap-2"
                        >
                            {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                            {saving ? 'Zapisywanie...' : 'Zapisz avatar'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
"""Bounded extraction of one uploaded Shapefile; never extract arbitrary ZIPs."""
import io
from pathlib import Path, PurePosixPath
import shutil
import stat
import zipfile
import zlib

MAX_MEMBERS = 64
MAX_EXPANDED_BYTES = 64 * 1024 * 1024
MAX_MEMBER_BYTES = 64 * 1024 * 1024
MAX_COMPRESSION_RATIO = 200
CHUNK_BYTES = 64 * 1024
ALLOWED_PARTS = {'.shp', '.shx', '.dbf', '.prj', '.cpg', '.sbn', '.sbx', '.qix'}
REQUIRED_PARTS = {'.shp', '.shx', '.dbf'}


def _plan(archive):
    members = archive.infolist()
    if not members or len(members) > MAX_MEMBERS:
        raise ValueError('El ZIP supera el límite de miembros o está vacío.')
    files, seen, dataset, parts = [], set(), None, set()
    expanded = compressed = 0
    for member in members:
        name = member.orig_filename
        components = name.rstrip('/').split('/')
        if (not name or name != member.filename or '\\' in name or ':' in name
                or name.startswith('/') or any(p in {'', '.', '..'} for p in components)
                or any(ord(c) < 32 or ord(c) == 127 for c in name)):
            raise ValueError('El ZIP contiene rutas no válidas.')
        key = name.rstrip('/').casefold()
        if key in seen:
            raise ValueError('El ZIP contiene nombres duplicados.')
        seen.add(key)
        kind = stat.S_IFMT(member.external_attr >> 16)
        if (kind not in {0, stat.S_IFREG, stat.S_IFDIR}
                or (kind != 0 and (kind == stat.S_IFDIR) != member.is_dir())):
            raise ValueError('El ZIP contiene enlaces o archivos especiales.')
        if member.flag_bits & 1 or member.compress_type not in {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED}:
            raise ValueError('El ZIP utiliza cifrado o compresión no permitida.')
        if member.is_dir():
            if member.file_size != 0:
                raise ValueError('El ZIP contiene un directorio no válido.')
            continue
        path = PurePosixPath(name)
        suffix = path.suffix.lower()
        if suffix not in ALLOWED_PARTS:
            raise ValueError('El ZIP solo puede contener piezas de un Shapefile; no admite archivos anidados.')
        identity = (str(path.parent).casefold(), path.stem.casefold())
        if not path.stem or (dataset is not None and identity != dataset) or suffix in parts:
            raise ValueError('El ZIP debe contener un único Shapefile sin piezas duplicadas.')
        dataset = identity
        parts.add(suffix)
        if member.file_size > MAX_MEMBER_BYTES:
            raise ValueError('Una pieza del ZIP supera el tamaño permitido.')
        if member.file_size > max(member.compress_size, 1) * MAX_COMPRESSION_RATIO:
            raise ValueError('El ZIP supera la relación de compresión permitida.')
        expanded += member.file_size
        compressed += member.compress_size
        if expanded > MAX_EXPANDED_BYTES:
            raise ValueError('El ZIP supera el límite de tamaño descomprimido.')
        files.append((member, suffix))
    if not REQUIRED_PARTS.issubset(parts):
        raise ValueError('El ZIP debe incluir las piezas .shp, .shx y .dbf del mismo Shapefile.')
    if expanded > max(compressed, 1) * MAX_COMPRESSION_RATIO:
        raise ValueError('El ZIP supera la relación de compresión permitida.')
    return files


def extract_shapefile(content: bytes, destination: Path) -> Path:
    """Preflight every entry, then count actual expanded bytes while streaming.

    destination must be a new directory in the server-owned request workspace.
    User paths are never used for filesystem writes. Partial output is removed.
    """
    created = complete = False
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            plan = _plan(archive)
            destination.mkdir()  # Refuse an existing directory or symlink.
            created = True
            total = 0
            for member, suffix in plan:
                actual = 0
                with archive.open(member) as source, (destination / ('layer' + suffix)).open('xb') as output:
                    while True:
                        allowance = min(CHUNK_BYTES, MAX_EXPANDED_BYTES - total + 1,
                                        MAX_MEMBER_BYTES - actual + 1)
                        chunk = source.read(allowance)
                        if not chunk:
                            break
                        actual += len(chunk)
                        total += len(chunk)
                        if (total > MAX_EXPANDED_BYTES or actual > MAX_MEMBER_BYTES
                                or actual > member.file_size
                                or actual > max(member.compress_size, 1) * MAX_COMPRESSION_RATIO):
                            raise ValueError('El ZIP supera los límites de extracción segura.')
                        output.write(chunk)
                if actual != member.file_size:
                    raise ValueError('El ZIP contiene tamaños inconsistentes.')
        complete = True
        return destination / 'layer.shp'
    except (zipfile.BadZipFile, zipfile.LargeZipFile, RuntimeError, NotImplementedError,
            EOFError, zlib.error) as exc:
        raise ValueError('El ZIP está dañado o utiliza una estructura no permitida.') from exc
    finally:
        if created and not complete:
            shutil.rmtree(destination, ignore_errors=True)

"""Fail-closed Linux sandbox for the upload reader, not the API process."""
import ctypes
import errno
import os
import platform
import resource
import sys


def restrict_reader(input_directory, runtime_directories):
    if sys.platform != 'linux' or platform.machine() not in {'x86_64', 'aarch64'}:
        raise RuntimeError('GIS isolation requires supported Linux')
    libc = ctypes.CDLL(None, use_errno=True)
    libc.syscall.restype = ctypes.c_long
    # Landlock syscall numbers are identical on these two architectures.
    abi = libc.syscall(444, 0, 0, 1)
    if abi < 1:
        raise RuntimeError('Landlock is unavailable')

    class Ruleset(ctypes.Structure):
        _fields_ = [('handled_access_fs', ctypes.c_uint64)]

    class PathRule(ctypes.Structure):
        _pack_ = 1
        _fields_ = [('allowed_access', ctypes.c_uint64), ('parent_fd', ctypes.c_int32)]

    # Deny all supported file operations except explicitly granted read access.
    handled = (1 << 13) - 1
    if abi >= 2:
        handled |= 1 << 13  # REFER
    if abi >= 3:
        handled |= 1 << 14  # TRUNCATE
    if abi >= 5:
        handled |= 1 << 15  # IOCTL_DEV
    rules = Ruleset(handled)
    fd = libc.syscall(444, ctypes.byref(rules), ctypes.sizeof(rules), 0)
    if fd < 0:
        raise RuntimeError('Cannot create Landlock ruleset')
    try:
        for path in {os.path.realpath(p) for p in [input_directory, *runtime_directories]}:
            if not os.path.exists(path):
                continue
            parent = os.open(path, os.O_PATH | os.O_CLOEXEC)
            try:
                access = (1 << 2) | ((1 << 3) if os.path.isdir(path) else 0)
                rule = PathRule(access, parent)
                if libc.syscall(445, fd, 1, ctypes.byref(rule), 0) < 0:
                    raise RuntimeError('Cannot add Landlock rule')
            finally:
                os.close(parent)
        if libc.prctl(38, 1, 0, 0, 0) != 0:  # PR_SET_NO_NEW_PRIVS
            raise RuntimeError('Cannot set no_new_privs')
        if libc.syscall(446, fd, 0) != 0:
            raise RuntimeError('Cannot enforce Landlock')
    finally:
        os.close(fd)

    # seccomp BPF: verify architecture, then deny network and process creation.
    # No dependency on an optional libseccomp package in Render.
    class Filter(ctypes.Structure):
        _fields_ = [('code', ctypes.c_ushort), ('jt', ctypes.c_ubyte),
                    ('jf', ctypes.c_ubyte), ('k', ctypes.c_uint32)]

    class Program(ctypes.Structure):
        _fields_ = [('len', ctypes.c_ushort), ('filter', ctypes.POINTER(Filter))]

    arch, denied = (
        (0xC000003E, [41, 42, 43, 49, 50, 53, 56, 57, 58, 59, 288, 322, 435, 425, 101, 310, 311, 304, 438])
        if platform.machine() == 'x86_64' else
        (0xC00000B7, [198, 199, 200, 201, 202, 203, 220, 221, 242, 281, 435, 425, 117, 270, 271, 265, 438])
    )
    filters = [Filter(0x20, 0, 0, 4), Filter(0x15, 1, 0, arch),
               Filter(0x06, 0, 0, 0x80000000), Filter(0x20, 0, 0, 0)]
    # x32 uses different syscall numbers; do not allow that alternate ABI.
    if platform.machine() == 'x86_64':
        filters += [Filter(0x45, 0, 1, 0x40000000), Filter(0x06, 0, 0, 0x80000000)]
    for number in denied:
        filters += [Filter(0x15, 0, 1, number), Filter(0x06, 0, 0, 0x00050000 | errno.EPERM)]
    filters += [Filter(0x06, 0, 0, 0x7FFF0000)]
    array = (Filter * len(filters))(*filters)
    program = Program(len(filters), array)
    if libc.prctl(22, 2, ctypes.byref(program), 0, 0) != 0:
        raise RuntimeError('Cannot enforce seccomp')
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    resource.setrlimit(resource.RLIMIT_CPU, (30, 30))
    # The enclosing conversion worker may already have a stricter hard limit.
    inherited = resource.getrlimit(resource.RLIMIT_AS)[1]
    memory = min(1024**3, inherited) if inherited != resource.RLIM_INFINITY else 1024**3
    resource.setrlimit(resource.RLIMIT_AS, (memory, memory))
    resource.setrlimit(resource.RLIMIT_FSIZE, (64 * 1024**2, 64 * 1024**2))

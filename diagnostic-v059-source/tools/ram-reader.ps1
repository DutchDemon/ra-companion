param(
    [Parameter(Mandatory = $true)]
    [int]$TargetPid,
    [int]$PollMs = 100
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public sealed class ActorScanResult
{
    public int Offset { get; set; }
    public int Name { get; set; }
    public int Room { get; set; }
    public uint Status { get; set; }
    public int Action { get; set; }
}

public static class ActorMemoryScanner
{
    private static byte[] scanBuffer;

    private static ushort ReadBE16(byte[] data, int offset)
    {
        return (ushort)((data[offset] << 8) | data[offset + 1]);
    }

    private static uint ReadBE32(byte[] data, int offset)
    {
        return ((uint)data[offset] << 24) | ((uint)data[offset + 1] << 16) | ((uint)data[offset + 2] << 8) | data[offset + 3];
    }

    public static ActorScanResult[] Scan(IntPtr viewBase, int bytesToScan, ushort[] names)
    {
        if (viewBase == IntPtr.Zero || bytesToScan <= 0 || names == null || names.Length == 0)
            return Array.Empty<ActorScanResult>();

        if (scanBuffer == null || scanBuffer.Length != bytesToScan)
            scanBuffer = new byte[bytesToScan];
        var data = scanBuffer;
        Marshal.Copy(viewBase, data, 0, bytesToScan);
        var wanted = new System.Collections.Generic.HashSet<ushort>(names);
        var found = new System.Collections.Generic.List<ActorScanResult>();

        // fopAc_ac_c begins with base_process_class. Process name is +0x08,
        // init_state is +0x0C, profile pointer +0x10, actor status +0x49C,
        // and current.roomNo +0x4E2. ni_class::mAction is +0x5FA.
        const int minActorBytes = 0x600;
        for (int offset = 0; offset <= bytesToScan - minActorBytes; offset += 4)
        {
            ushort name = ReadBE16(data, offset + 0x08);
            if (!wanted.Contains(name) || data[offset + 0x0C] != 2)
                continue;

            uint profile = ReadBE32(data, offset + 0x10);
            if (profile < 0x80000000u || profile >= 0x81800000u || (profile & 3u) != 0)
                continue;

            int room = unchecked((sbyte)data[offset + 0x4E2]);
            if (room < -1 || room > 63)
                continue;

            uint status = ReadBE32(data, offset + 0x49C);
            int action = ReadBE16(data, offset + 0x5FA);
            found.Add(new ActorScanResult { Offset = offset, Name = name, Room = room, Status = status, Action = action });
            if (found.Count >= 256)
                break;
        }
        return found.ToArray();
    }
}

public static class DolphinSharedMemory
{
    public const uint FILE_MAP_READ = 0x0004;

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr OpenFileMapping(
        uint dwDesiredAccess,
        bool bInheritHandle,
        string lpName);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr MapViewOfFile(
        IntPtr hFileMappingObject,
        uint dwDesiredAccess,
        uint dwFileOffsetHigh,
        uint dwFileOffsetLow,
        UIntPtr dwNumberOfBytesToMap);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool UnmapViewOfFile(IntPtr lpBaseAddress);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool CloseHandle(IntPtr hObject);
}
'@

function Convert-HexToUInt64([string]$hex) {
    return [Convert]::ToUInt64($hex, 16)
}

$MEM1_GUEST_BASE = Convert-HexToUInt64 '80000000'
$GAMECUBE_MAGIC = [byte[]](0xC2, 0x33, 0x9F, 0x3D)

# Twilight Princess addresses from the matching decomp symbols/structure offsets.
# These are guest addresses. Because MEM1 begins at offset 0 in Dolphin's shared
# memory segment, guest 0x80000000 == shared-memory offset 0.
# RetroAchievements game 3934 supports the USA GameCube build. v0.5.1 deliberately
# targets GZ2E01 only so every save/event/inventory offset is deterministic.
$versions = @{
    'GZ2E01' = [pscustomobject]@{ Name = 'USA'; StartStage = (Convert-HexToUInt64 '8040AFC0'); StayRoom = (Convert-HexToUInt64 '80450D64') }
}

# Actor process names from f_pc_name.h. The scanner is intentionally generic:
# individual achievement rules consume these live actor summaries without writing game memory.
$PROC_CUCCO = 0x0108 # fpcNm_NI_e / ni_class
$PROC_DOG = 0x010C   # fpcNm_DO_e / do_class
$MEM1_SIZE = 0x01800000
$script:actorScanCache = @()
$script:lastActorScanAt = 0L
$script:lastActorScanStage = ''
$script:lastActorScanRoom = -999

$stageMap = @{
    'D_MN05'  = [pscustomobject]@{ Label = 'Forest Temple'; Kind = 'dungeon'; Boss = $null }
    'D_MN05A' = [pscustomobject]@{ Label = 'Forest Temple'; Kind = 'dungeon'; Boss = 'Diababa' }
    'D_MN05B' = [pscustomobject]@{ Label = 'Forest Temple'; Kind = 'dungeon'; Boss = 'Ook' }
    'D_MN04'  = [pscustomobject]@{ Label = 'Goron Mines'; Kind = 'dungeon'; Boss = $null }
    'D_MN04A' = [pscustomobject]@{ Label = 'Goron Mines'; Kind = 'dungeon'; Boss = 'Fyrus' }
    'D_MN04B' = [pscustomobject]@{ Label = 'Goron Mines'; Kind = 'dungeon'; Boss = 'Dangoro' }
    'D_MN01'  = [pscustomobject]@{ Label = 'Lakebed Temple'; Kind = 'dungeon'; Boss = $null }
    'D_MN01A' = [pscustomobject]@{ Label = 'Lakebed Temple'; Kind = 'dungeon'; Boss = 'Morpheel' }
    'D_MN01B' = [pscustomobject]@{ Label = 'Lakebed Temple'; Kind = 'dungeon'; Boss = 'Deku Toad' }
    'D_MN10'  = [pscustomobject]@{ Label = "Arbiter's Grounds"; Kind = 'dungeon'; Boss = $null }
    'D_MN10A' = [pscustomobject]@{ Label = "Arbiter's Grounds"; Kind = 'dungeon'; Boss = 'Stallord' }
    'D_MN10B' = [pscustomobject]@{ Label = "Arbiter's Grounds"; Kind = 'dungeon'; Boss = 'Death Sword' }
    'D_MN11'  = [pscustomobject]@{ Label = 'Snowpeak Ruins'; Kind = 'dungeon'; Boss = $null }
    'D_MN11A' = [pscustomobject]@{ Label = 'Snowpeak Ruins'; Kind = 'dungeon'; Boss = 'Blizzeta' }
    'D_MN11B' = [pscustomobject]@{ Label = 'Snowpeak Ruins'; Kind = 'dungeon'; Boss = 'Darkhammer' }
    'D_MN06'  = [pscustomobject]@{ Label = 'Temple of Time'; Kind = 'dungeon'; Boss = $null }
    'D_MN06A' = [pscustomobject]@{ Label = 'Temple of Time'; Kind = 'dungeon'; Boss = 'Armogohma' }
    'D_MN06B' = [pscustomobject]@{ Label = 'Temple of Time'; Kind = 'dungeon'; Boss = $null }
    'D_MN07'  = [pscustomobject]@{ Label = 'City in the Sky'; Kind = 'dungeon'; Boss = $null }
    'D_MN07A' = [pscustomobject]@{ Label = 'City in the Sky'; Kind = 'dungeon'; Boss = 'Argorok' }
    'D_MN07B' = [pscustomobject]@{ Label = 'City in the Sky'; Kind = 'dungeon'; Boss = 'Aeralfos' }
    'D_MN08'  = [pscustomobject]@{ Label = 'Palace of Twilight'; Kind = 'dungeon'; Boss = $null }
    'D_MN08A' = [pscustomobject]@{ Label = 'Palace of Twilight'; Kind = 'dungeon'; Boss = $null }
    'D_MN08B' = [pscustomobject]@{ Label = 'Palace of Twilight'; Kind = 'dungeon'; Boss = $null }
    'D_MN08C' = [pscustomobject]@{ Label = 'Palace of Twilight'; Kind = 'dungeon'; Boss = $null }
    'D_MN08D' = [pscustomobject]@{ Label = 'Palace of Twilight'; Kind = 'dungeon'; Boss = 'Zant' }
    'D_MN09'  = [pscustomobject]@{ Label = 'Hyrule Castle'; Kind = 'dungeon'; Boss = $null }
    'D_MN09A' = [pscustomobject]@{ Label = 'Hyrule Castle'; Kind = 'dungeon'; Boss = 'Ganondorf' }
    'D_MN09B' = [pscustomobject]@{ Label = 'Hyrule Castle'; Kind = 'dungeon'; Boss = $null }

    # Overworld / story fields
    'F_SP00'  = [pscustomobject]@{ Label = 'Ordon Ranch'; Kind = 'area'; Boss = $null }
    'F_SP102' = [pscustomobject]@{ Label = 'Hyrule Field'; Kind = 'area'; Boss = $null }
    'F_SP103' = [pscustomobject]@{ Label = 'Ordon Village'; Kind = 'area'; Boss = $null }
    'F_SP104' = [pscustomobject]@{ Label = 'Ordon Woods'; Kind = 'area'; Boss = $null }
    'F_SP108' = [pscustomobject]@{ Label = 'Faron Woods'; Kind = 'area'; Boss = $null }
    'F_SP109' = [pscustomobject]@{ Label = 'Kakariko Village'; Kind = 'area'; Boss = $null }
    'F_SP110' = [pscustomobject]@{ Label = 'Death Mountain'; Kind = 'area'; Boss = $null }
    'F_SP111' = [pscustomobject]@{ Label = 'Kakariko Graveyard'; Kind = 'area'; Boss = $null }
    'F_SP112' = [pscustomobject]@{ Label = "Zora's River"; Kind = 'area'; Boss = $null }
    'F_SP113' = [pscustomobject]@{ Label = "Zora's Domain"; Kind = 'area'; Boss = $null }
    'F_SP114' = [pscustomobject]@{ Label = 'Snowpeak'; Kind = 'area'; Boss = $null }
    'F_SP115' = [pscustomobject]@{ Label = 'Lake Hylia'; Kind = 'area'; Boss = $null }
    'F_SP116' = [pscustomobject]@{ Label = 'Hyrule Town'; Kind = 'area'; Boss = $null }
    'F_SP117' = [pscustomobject]@{ Label = 'Sacred Grove'; Kind = 'area'; Boss = $null }
    'F_SP118' = [pscustomobject]@{ Label = "Arbiter's Grounds"; Kind = 'area'; Boss = $null }
    'F_SP121' = [pscustomobject]@{ Label = 'Hyrule Field'; Kind = 'area'; Boss = $null }
    'F_SP122' = [pscustomobject]@{ Label = 'Hyrule Field'; Kind = 'area'; Boss = $null }
    'F_SP123' = [pscustomobject]@{ Label = 'Hyrule Field'; Kind = 'area'; Boss = $null }
    'F_SP124' = [pscustomobject]@{ Label = 'Gerudo Desert'; Kind = 'area'; Boss = $null }
    'F_SP125' = [pscustomobject]@{ Label = 'Mirror Chamber'; Kind = 'area'; Boss = $null }
    'F_SP126' = [pscustomobject]@{ Label = "Zora's River"; Kind = 'area'; Boss = $null }
    'F_SP127' = [pscustomobject]@{ Label = 'Faron Woods'; Kind = 'area'; Boss = $null }
    'F_SP128' = [pscustomobject]@{ Label = 'Hidden Village'; Kind = 'area'; Boss = $null }
    'F_SP200' = [pscustomobject]@{ Label = "Hero's Spirit"; Kind = 'area'; Boss = $null }

    # Interiors
    'R_SP01'  = [pscustomobject]@{ Label = 'Ordon Village Houses'; Kind = 'building'; Boss = $null }
    'R_SP107' = [pscustomobject]@{ Label = 'Twilight Hyrule Castle'; Kind = 'building'; Boss = $null }
    'R_SP108' = [pscustomobject]@{ Label = 'Faron Woods House'; Kind = 'building'; Boss = $null }
    'R_SP109' = [pscustomobject]@{ Label = 'Kakariko Houses'; Kind = 'building'; Boss = $null }
    'R_SP110' = [pscustomobject]@{ Label = 'Death Mountain Dojo'; Kind = 'building'; Boss = $null }
    'R_SP116' = [pscustomobject]@{ Label = 'Hyrule Town Pub'; Kind = 'building'; Boss = $null }
    'R_SP127' = [pscustomobject]@{ Label = 'Fishing Pond'; Kind = 'building'; Boss = $null }
    'R_SP128' = [pscustomobject]@{ Label = "Impaz's House"; Kind = 'building'; Boss = $null }
    'R_SP160' = [pscustomobject]@{ Label = 'Hyrule Town Rooms'; Kind = 'building'; Boss = $null }
    'R_SP161' = [pscustomobject]@{ Label = 'STAR Game'; Kind = 'building'; Boss = $null }

    # Caves / grottos with known labels
    'D_SB01' = [pscustomobject]@{ Label = 'Cave of Ordeals'; Kind = 'cave'; Boss = $null }
    'D_SB03' = [pscustomobject]@{ Label = 'Lake Hylia Lantern Cave'; Kind = 'cave'; Boss = $null }
    'D_SB04' = [pscustomobject]@{ Label = 'Eldin Bridge Lava Cave'; Kind = 'cave'; Boss = $null }
    'D_SB05' = [pscustomobject]@{ Label = 'Small Cave'; Kind = 'cave'; Boss = $null }
    'D_SB06' = [pscustomobject]@{ Label = 'Small Cave'; Kind = 'cave'; Boss = $null }
    'D_SB07' = [pscustomobject]@{ Label = 'Small Cave'; Kind = 'cave'; Boss = $null }
    'D_SB08' = [pscustomobject]@{ Label = 'Small Cave'; Kind = 'cave'; Boss = $null }
    'D_SB09' = [pscustomobject]@{ Label = 'Lake Hylia Beehive Cave'; Kind = 'cave'; Boss = $null }
    'D_SB10' = [pscustomobject]@{ Label = 'Faron Woods Tunnel'; Kind = 'cave'; Boss = $null }
}

function Write-State($state) {
    $state['timestamp'] = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    [Console]::WriteLine(($state | ConvertTo-Json -Compress -Depth 6))
    [Console]::Out.Flush()
}

if (-not [Environment]::Is64BitProcess) {
    Write-State @{
        ok = $false
        attached = $false
        processId = $TargetPid
        error = '32-bit PowerShell detected. RAM reader requires 64-bit PowerShell.'
        host64Bit = $false
    }
    exit 3
}

function Get-ExpectedGameCode() {
    try {
        $proc = Get-Process -Id $TargetPid -ErrorAction Stop
        $title = [string]$proc.MainWindowTitle
        if ($title -match '\((GZ2E01)\)') { return $Matches[1] }
    } catch {}
    return ''
}

function Read-SharedBytes([IntPtr]$viewBase, [uint64]$offset, [int]$count) {
    if ($viewBase -eq [IntPtr]::Zero -or $count -le 0) { return $null }
    # Every address currently read from TP is within the first few MiB of MEM1,
    # therefore IntPtr.Add's signed 32-bit offset is sufficient and avoids any
    # PowerShell 5.1 signed/unsigned pointer conversions.
    if ($offset -gt [uint64][int]::MaxValue) { return $null }
    $buffer = New-Object byte[] $count
    try {
        $ptr = [IntPtr]::Add($viewBase, [int]$offset)
        [Runtime.InteropServices.Marshal]::Copy($ptr, $buffer, 0, $count)
        return $buffer
    } catch {
        return $null
    }
}

function Get-AsciiSafe([byte[]]$bytes, [int]$offset, [int]$count) {
    if ($null -eq $bytes -or $bytes.Length -lt ($offset + $count)) { return '' }
    $slice = [byte[]]$bytes[$offset..($offset + $count - 1)]
    foreach ($b in $slice) {
        if ($b -eq 0) { continue }
        if ($b -lt 0x20 -or $b -gt 0x7E) { return '' }
    }
    return ([Text.Encoding]::ASCII.GetString($slice)).Trim([char]0).Trim()
}

function Test-Magic([byte[]]$header) {
    if ($null -eq $header -or $header.Length -lt 0x20) { return $false }
    for ($i = 0; $i -lt 4; $i++) {
        if ($header[0x1C + $i] -ne $GAMECUBE_MAGIC[$i]) { return $false }
    }
    return $true
}

function Test-StageCode([string]$value) {
    if ([string]::IsNullOrWhiteSpace($value)) { return $false }
    return $value -match '^[A-Z][A-Z0-9]?_[A-Z0-9]{2,6}$'
}

function To-SignedByte([byte]$value) {
    if ($value -ge 128) { return [int]$value - 256 }
    return [int]$value
}

function Guest-To-Offset([uint64]$guestAddress) {
    if ($guestAddress -lt $MEM1_GUEST_BASE) { return [uint64]::MaxValue }
    return $guestAddress - $MEM1_GUEST_BASE
}

function Open-DolphinSharedMemory() {
    $names = @(
        "dolphin-emu.$TargetPid",
        "Local\dolphin-emu.$TargetPid"
    )

    $errors = @()
    foreach ($name in $names) {
        $mapping = [DolphinSharedMemory]::OpenFileMapping(
            [DolphinSharedMemory]::FILE_MAP_READ,
            $false,
            $name
        )
        if ($mapping -eq [IntPtr]::Zero) {
            $errors += "$name -> Win32 $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
            continue
        }

        $view = [DolphinSharedMemory]::MapViewOfFile(
            $mapping,
            [DolphinSharedMemory]::FILE_MAP_READ,
            0,
            0,
            [UIntPtr]::Zero
        )
        if ($view -eq [IntPtr]::Zero) {
            $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
            [void][DolphinSharedMemory]::CloseHandle($mapping)
            $errors += "$name map -> Win32 $err"
            continue
        }

        return [pscustomobject]@{
            Name = $name
            Mapping = $mapping
            View = $view
        }
    }

    return [pscustomobject]@{
        Name = "dolphin-emu.$TargetPid"
        Mapping = [IntPtr]::Zero
        View = [IntPtr]::Zero
        Errors = ($errors -join '; ')
    }
}

function Close-DolphinSharedMemory($shared) {
    if ($null -eq $shared) { return }
    if ($shared.View -ne [IntPtr]::Zero) { [void][DolphinSharedMemory]::UnmapViewOfFile($shared.View) }
    if ($shared.Mapping -ne [IntPtr]::Zero) { [void][DolphinSharedMemory]::CloseHandle($shared.Mapping) }
}

function Read-HeaderState($shared) {
    $header = Read-SharedBytes $shared.View 0 0x40
    if ($null -eq $header) { return $null }
    $gameCode = Get-AsciiSafe $header 0 6
    $magic = Test-Magic $header
    return [pscustomobject]@{
        GameCode = $gameCode
        Magic = $magic
        Supported = $versions.ContainsKey($gameCode)
    }
}

function Get-BitCountByte([byte]$value) {
    $count = 0
    for ($i = 0; $i -lt 8; $i++) {
        if (($value -band (1 -shl $i)) -ne 0) { $count++ }
    }
    return $count
}

function Get-GoldenBugCount([byte[]]$flagBytes) {
    if ($null -eq $flagBytes -or $flagBytes.Length -lt 4) { return $null }
    # mItemFlags[6] is a big-endian u32. Golden Bug item IDs 0xC0..0xD7 are
    # bits 0..23, which are the last three bytes in memory.
    return (Get-BitCountByte $flagBytes[1]) + (Get-BitCountByte $flagBytes[2]) + (Get-BitCountByte $flagBytes[3])
}

function Read-BigEndianUInt16([byte[]]$bytes) {
    if ($null -eq $bytes -or $bytes.Length -lt 2) { return $null }
    return ([int]$bytes[0] * 256) + [int]$bytes[1]
}

function Read-BigEndianUInt32([byte[]]$bytes) {
    if ($null -eq $bytes -or $bytes.Length -lt 4) { return $null }
    return ([uint32]$bytes[0] -shl 24) -bor ([uint32]$bytes[1] -shl 16) -bor ([uint32]$bytes[2] -shl 8) -bor [uint32]$bytes[3]
}

function Convert-BytesToHex([byte[]]$bytes) {
    if ($null -eq $bytes) { return '' }
    return -join ($bytes | ForEach-Object { $_.ToString('x2') })
}

function Test-EncodedEventFlag([byte[]]$eventBytes, [int]$encoded) {
    if ($null -eq $eventBytes -or $eventBytes.Length -lt 256) { return $false }
    $index = ($encoded -shr 8) -band 0xFF
    $mask = $encoded -band 0xFF
    if ($index -lt 0 -or $index -ge $eventBytes.Length -or $mask -eq 0) { return $false }
    return (($eventBytes[$index] -band $mask) -ne 0)
}

function Test-FirstItemFlag([byte[]]$flagBytes, [int]$itemId) {
    if ($null -eq $flagBytes -or $flagBytes.Length -lt 32 -or $itemId -lt 0 -or $itemId -gt 255) { return $false }
    $wordIndex = [Math]::Floor($itemId / 32)
    $bit = $itemId % 32
    $offset = [int]$wordIndex * 4
    $word = Read-BigEndianUInt32 ([byte[]]$flagBytes[$offset..($offset + 3)])
    if ($null -eq $word) { return $false }
    $mask = [uint32]1 -shl $bit
    return (($word -band $mask) -ne 0)
}

function Get-BottleCount([byte[]]$inventory) {
    if ($null -eq $inventory -or $inventory.Length -lt 15) { return $null }
    $count = 0
    foreach ($slot in 11..14) {
        # Bottle slots are fixed in dSv_player_item_c. 0xFF is NONE.
        if ($inventory[$slot] -ne 0xFF) { $count++ }
    }
    return $count
}

function Get-FishingCounts([byte[]]$bytes) {
    $result = @()
    if ($null -eq $bytes -or $bytes.Length -lt 32) { return $result }
    for ($i = 0; $i -lt 16; $i++) {
        $offset = $i * 2
        $result += (Read-BigEndianUInt16 ([byte[]]$bytes[$offset..($offset + 1)]))
    }
    return $result
}

function Read-ByteAtGuest($shared, [uint64]$guestAddress) {
    $bytes = Read-SharedBytes $shared.View (Guest-To-Offset $guestAddress) 1
    if ($null -eq $bytes -or $bytes.Length -lt 1) { return $null }
    return [int]$bytes[0]
}

function Test-FlagBit($value, [int]$bit) {
    if ($null -eq $value) { return $false }
    return (([int]$value -band (1 -shl $bit)) -ne 0)
}

function Get-LiveActorSummary($shared, [string]$stageCode, [int]$room) {
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $needsScan = (($now - $script:lastActorScanAt) -ge 1000) -or ($script:lastActorScanStage -ne $stageCode) -or ($script:lastActorScanRoom -ne $room)
    if ($needsScan) {
        try {
            $script:actorScanCache = @([ActorMemoryScanner]::Scan($shared.View, $MEM1_SIZE, [uint16[]]@($PROC_DOG, $PROC_CUCCO)))
        } catch {
            $script:actorScanCache = @()
        }
        $script:lastActorScanAt = $now
        $script:lastActorScanStage = $stageCode
        $script:lastActorScanRoom = $room
    }

    $dogs = @($script:actorScanCache | Where-Object { $_.Name -eq $PROC_DOG })
    $cuccos = @($script:actorScanCache | Where-Object { $_.Name -eq $PROC_CUCCO })
    $dogsHere = @($dogs | Where-Object { $_.Room -eq $room -or $_.Room -eq -1 })
    $cuccosHere = @($cuccos | Where-Object { $_.Room -eq $room -or $_.Room -eq -1 })
    $carryMask = [uint32]0x00002000 # fopAcStts_CARRY_NOW_e

    return [ordered]@{
        scanVersion = 1
        dog = [ordered]@{
            total = $dogs.Count
            currentRoom = $dogsHere.Count
            carried = @($dogs | Where-Object { (($_.Status -band $carryMask) -ne 0) }).Count
        }
        cucco = [ordered]@{
            total = $cuccos.Count
            currentRoom = $cuccosHere.Count
            carried = @($cuccos | Where-Object { (($_.Status -band $carryMask) -ne 0) }).Count
            controlled = @($cuccos | Where-Object { $_.Action -eq 15 }).Count # ni_class ACTION_PLAY_e
        }
    }
}

function Read-CurrentState($shared, [string]$gameCode) {
    $version = $versions[$gameCode]
    if ($null -eq $version) { return $null }

    $startOffset = Guest-To-Offset ([uint64]$version.StartStage)
    $bytes = Read-SharedBytes $shared.View $startOffset 13
    if ($null -eq $bytes) { return $null }

    $stageCode = Get-AsciiSafe $bytes 0 8
    if (-not (Test-StageCode $stageCode)) { return $null }

    $pointUnsigned = ([int]$bytes[8] -shl 8) -bor [int]$bytes[9]
    $point = if ($pointUnsigned -ge 0x8000) { $pointUnsigned - 0x10000 } else { $pointUnsigned }
    $startRoom = To-SignedByte $bytes[10]
    $layer = To-SignedByte $bytes[11]
    $darkArea = To-SignedByte $bytes[12]

    $stayOffset = Guest-To-Offset ([uint64]$version.StayRoom)
    $stayBytes = Read-SharedBytes $shared.View $stayOffset 1
    $room = if ($null -ne $stayBytes) { To-SignedByte $stayBytes[0] } else { $startRoom }

    # Live collection counters from dSv_info_c / dSv_player_c.
    # g_dComIfG_gameInfo starts 0x4E00 bytes before dComIfG_play_c::mStartStage.
    # Player collection: mPohNum = gameInfo + 0x10C.
    # First-item flags: mItemFlags[6] = gameInfo + 0x0E4; item IDs 0xC0..0xD7 are the 24 Golden Bugs.
    $gameInfoGuest = ([uint64]$version.StartStage) - [uint64]0x4E00

    # Context-aware missable state. These offsets are derived from the official RA
    # Code Notes for game 3934 (USA addresses) and expressed relative to
    # g_dComIfG_gameInfo / mStartStage, which keeps them region-safe with the
    # version-specific StartStage base above. All reads are read-only.
    $linkTransformByte = Read-ByteAtGuest $shared ($gameInfoGuest + [uint64]0x01E) # RA 0x4061DE: 00 human, 01 wolf
    $linkForm = if ($linkTransformByte -eq 0x00) { 'human' } elseif ($linkTransformByte -eq 0x01) { 'wolf' } else { 'unknown' }

    $playerControlByte = Read-ByteAtGuest $shared ($gameInfoGuest + [uint64]0x07C) # RA 0x40623C
    $playerControl = if ($null -eq $playerControlByte) { $null } else { [bool]($playerControlByte -eq 0x01) }

    $inCutsceneByte = Read-ByteAtGuest $shared (([uint64]$version.StartStage) + [uint64]0x1AD) # RA 0x40B16D
    $inCutscene = if ($null -eq $inCutsceneByte) { $null } else { [bool]($inCutsceneByte -eq 0x01) }

    $locationDetailBytes = Read-SharedBytes $shared.View (Guest-To-Offset (([uint64]$version.StartStage) + [uint64]0x17)) 3
    $areaEntranceId = if ($null -ne $locationDetailBytes) { [int]$locationDetailBytes[0] } else { $null }
    $roomBuildingId = if ($null -ne $locationDetailBytes) { [int]$locationDetailBytes[1] } else { $null }
    $grottoId = if ($null -ne $locationDetailBytes) { [int]$locationDetailBytes[2] } else { $null }

    $minigameBytes = Read-SharedBytes $shared.View (Guest-To-Offset (([uint64]$version.StartStage) + [uint64]0x113C)) 4 # RA 0x40C0FC
    $minigameId = Read-BigEndianUInt32 $minigameBytes

    # v0.5.1 Game State Engine: read the actual save/event structures from the
    # matching GZ2E01 decomp layout. We expose compact raw flag tables plus a curated
    # set of named state flags used by current achievement rules. This stays read-only.
    $eventBytes = Read-SharedBytes $shared.View (Guest-To-Offset ($gameInfoGuest + [uint64]0x7F0)) 256
    $tempEventBytes = Read-SharedBytes $shared.View (Guest-To-Offset ($gameInfoGuest + [uint64]0xDD8)) 256
    $inventoryBytes = Read-SharedBytes $shared.View (Guest-To-Offset ($gameInfoGuest + [uint64]0x09C)) 24
    $firstItemBytes = Read-SharedBytes $shared.View (Guest-To-Offset ($gameInfoGuest + [uint64]0x0CC)) 32
    $statusBytes = Read-SharedBytes $shared.View (Guest-To-Offset $gameInfoGuest) 10
    $fishingBytes = Read-SharedBytes $shared.View (Guest-To-Offset ($gameInfoGuest + [uint64]0x16C)) 32
    $miniGameSaveBytes = Read-SharedBytes $shared.View (Guest-To-Offset ($gameInfoGuest + [uint64]0x940)) 24

    $maxLife = if ($null -ne $statusBytes) { Read-BigEndianUInt16 ([byte[]]$statusBytes[0..1]) } else { $null }
    $life = if ($null -ne $statusBytes) { Read-BigEndianUInt16 ([byte[]]$statusBytes[2..3]) } else { $null }
    $rupees = if ($null -ne $statusBytes) { Read-BigEndianUInt16 ([byte[]]$statusBytes[4..5]) } else { $null }
    $maxHearts = if ($null -ne $maxLife) { [Math]::Floor($maxLife / 5) } else { $null }
    $currentHearts = if ($null -ne $life) { [Math]::Round($life / 5.0, 1) } else { $null }
    $bottleCount = Get-BottleCount $inventoryBytes
    $magicArmorOwned = Test-FirstItemFlag $firstItemBytes 0x30
    $galeBoomerangObtained = if ($null -ne $inventoryBytes -and $inventoryBytes.Length -gt 0) { [bool]($inventoryBytes[0] -eq 0x40) } else { $false }
    $fishingCounts = Get-FishingCounts $fishingBytes

    $miniGameStats = [ordered]@{
        hookGameTime = if ($null -ne $miniGameSaveBytes) { Read-BigEndianUInt32 ([byte[]]$miniGameSaveBytes[4..7]) } else { $null }
        balloonScore = if ($null -ne $miniGameSaveBytes) { Read-BigEndianUInt32 ([byte[]]$miniGameSaveBytes[8..11]) } else { $null }
        raceGameTime = if ($null -ne $miniGameSaveBytes) { Read-BigEndianUInt32 ([byte[]]$miniGameSaveBytes[12..15]) } else { $null }
    }

    $stateFlags = [ordered]@{
        # Opening Ordon missables (zeldaret/tp d_save_bit_labels.inc).
        buzzHiveDroppedHawk = (Test-EncodedEventFlag $eventBytes 0x1520)        # F_0072
        buzzHanchAttackedByBees = (Test-EncodedEventFlag $eventBytes 0x1508)    # F_0074
        smilingPolitelyTriggered = (Test-EncodedEventFlag $eventBytes 0x1504)   # F_0075
        goatDay2Success = (Test-EncodedEventFlag $eventBytes 0x1640)            # F_0079
        goatDay2FailedOnce = (Test-EncodedEventFlag $eventBytes 0x0280)         # F_0013
        buzzHiveDroppedSlingshot = (Test-EncodedEventFlag $eventBytes 0x1602)   # F_0084
        goatDay3Success = (Test-EncodedEventFlag $eventBytes 0x4840)            # F_0587
        goatDay3FailedOnce = (Test-EncodedEventFlag $eventBytes 0x4820)         # F_0588

        # Ordon't Worry: individual post-children conversations.
        ordonUliPostKids = ((Test-EncodedEventFlag $eventBytes 0x3F20) -or (Test-EncodedEventFlag $eventBytes 0x3F10))
        ordonJagglePostKids = (Test-EncodedEventFlag $eventBytes 0x3F04)
        ordonSeraPostKids = ((Test-EncodedEventFlag $eventBytes 0x3F02) -or (Test-EncodedEventFlag $eventBytes 0x3F01))
        ordonHanchPostKids = (Test-EncodedEventFlag $eventBytes 0x4020)
        ordonPergiePostKids = (Test-EncodedEventFlag $eventBytes 0x4180)
        ordonFadoPostKids = (Test-EncodedEventFlag $eventBytes 0x4110)

        # Other useful one-time state.
        trillStealingAttackStarted = (Test-EncodedEventFlag $eventBytes 0x6110) # F_0802
        firstRollingGoronThrown = (Test-EncodedEventFlag $eventBytes 0x0A40)     # M_049
        horsebackBattleCleared = (Test-EncodedEventFlag $eventBytes 0x0A08)     # M_052
        rollgoalAllClear = (Test-EncodedEventFlag $eventBytes 0x4E20)            # F_0637
        fishingLoachBobber = (Test-EncodedEventFlag $eventBytes 0x5010)          # F_0654
        fishingLoachLureHena = (Test-EncodedEventFlag $eventBytes 0x5002)        # F_0657
    }

    # Preserve the existing stable high-level flags used by context rules, but derive
    # boomerang directly from inventory and supplement them with the new fine state.
    $eventEpona = Read-ByteAtGuest $shared ($gameInfoGuest + [uint64]0x1FA)
    $eventFaronTwilight = Read-ByteAtGuest $shared ($gameInfoGuest + [uint64]0x1FD)
    $eventTalo = Read-ByteAtGuest $shared ($gameInfoGuest + [uint64]0x23E)
    $eventForestTemple = Read-ByteAtGuest $shared ($gameInfoGuest + [uint64]0x6A1)
    $eventOrdonStory = Read-ByteAtGuest $shared ($gameInfoGuest + [uint64]0x7F7)
    $eventTrill = Read-ByteAtGuest $shared ($gameInfoGuest + [uint64]0x80C)
    $eventMasterSword = Read-ByteAtGuest $shared ($gameInfoGuest + [uint64]0x810)
    $eventMayorBo = Read-ByteAtGuest $shared ($gameInfoGuest + [uint64]0x829)
    $eventArchery = Read-ByteAtGuest $shared ($gameInfoGuest + [uint64]0xDDE)
    $lightDropGetFlags = Read-ByteAtGuest $shared ($gameInfoGuest + [uint64]0x118)
    $fusedShadowFlagByte = Read-ByteAtGuest $shared ($gameInfoGuest + [uint64]0x109)

    $storyFlags = [ordered]@{
        galeBoomerangObtained = [bool]$galeBoomerangObtained
        eponaRecovered = (Test-FlagBit $eventEpona 1)
        faronTwilightStarted = (Test-FlagBit $eventFaronTwilight 7)
        taloRescued = (Test-FlagBit $eventTalo 1)
        forestTempleEntered = (Test-FlagBit $eventForestTemple 6)
        returnedLightToEldin = (Test-FlagBit $eventOrdonStory 3)
        toldMayorBoAboutKids = (Test-FlagBit $eventOrdonStory 5)
        trillPunishedEvildoers = (Test-FlagBit $eventTrill 3)
        masterSwordObtained = (Test-FlagBit $eventMasterSword 5)
        mayorBoSecondMatchDefeated = (Test-FlagBit $eventMayorBo 0)
        maloArcheryInProgress = (Test-FlagBit $eventArchery 2)
        forestTempleCleared = (Test-FlagBit $fusedShadowFlagByte 0)
        goronMinesCleared = (Test-FlagBit $fusedShadowFlagByte 1)
        lakebedTempleCleared = (Test-FlagBit $fusedShadowFlagByte 2)
        faronVesselObtained = (Test-FlagBit $lightDropGetFlags 0)
        eldinVesselObtained = (Test-FlagBit $lightDropGetFlags 1)
        lanayruVesselObtained = (Test-FlagBit $lightDropGetFlags 2)
    }

    $poeBytes = Read-SharedBytes $shared.View (Guest-To-Offset ($gameInfoGuest + [uint64]0x10C)) 1
    $poeSouls = if ($null -ne $poeBytes) { [int]$poeBytes[0] } else { $null }

    $bugFlagBytes = Read-SharedBytes $shared.View (Guest-To-Offset ($gameInfoGuest + [uint64]0x0E4)) 4
    $goldenBugs = Get-GoldenBugCount $bugFlagBytes

    $collectBytes = Read-SharedBytes $shared.View (Guest-To-Offset ($gameInfoGuest + [uint64]0x109)) 2
    $fusedShadows = if ($null -ne $collectBytes) { Get-BitCountByte $collectBytes[0] } else { $null }
    $mirrorShards = if ($null -ne $collectBytes) { Get-BitCountByte $collectBytes[1] } else { $null }

    # dSv_light_drop_c lives at player-save +0x114 for this GZ2E01 layout:
    #   +0x00 mLightDropNum[4], +0x04 mLightDropGetFlag.
    # Vessel flags are one bit per province: Faron=0, Eldin=1, Lanayru=2.
    $tearBytes = Read-SharedBytes $shared.View (Guest-To-Offset ($gameInfoGuest + [uint64]0x114)) 4
    $faronTears = if ($null -ne $tearBytes) { [int]$tearBytes[0] } else { $null }
    $eldinTears = if ($null -ne $tearBytes) { [int]$tearBytes[1] } else { $null }
    $lanayruTears = if ($null -ne $tearBytes) { [int]$tearBytes[2] } else { $null }

    $deathBytes = Read-SharedBytes $shared.View (Guest-To-Offset ($gameInfoGuest + [uint64]0x1B2)) 2
    $gameOvers = Read-BigEndianUInt16 $deathBytes
    $actors = Get-LiveActorSummary $shared $stageCode $room

    $mapped = $stageMap[$stageCode]
    $label = if ($mapped) { $mapped.Label } else { $stageCode }
    $kind = if ($mapped) { $mapped.Kind } else { 'stage' }
    $boss = if ($mapped) { $mapped.Boss } else { $null }

    return [ordered]@{
        ok = $true
        attached = $true
        processId = $TargetPid
        gameCode = $gameCode
        region = $version.Name
        sharedMemoryName = $shared.Name
        mappingOpen = $true
        mem1Base = ('shared:+0x0 (view 0x{0:X})' -f $shared.View.ToInt64())
        hookSource = 'dolphin-shared-memory'
        stageCode = $stageCode
        stageName = $label
        kind = $kind
        boss = $boss
        mapped = [bool]$mapped
        startRoom = $startRoom
        room = $room
        layer = $layer
        darkArea = $darkArea
        point = $point
        linkForm = $linkForm
        playerControl = $playerControl
        inCutscene = $inCutscene
        areaEntranceId = $areaEntranceId
        roomBuildingId = $roomBuildingId
        grottoId = $grottoId
        minigameId = $minigameId
        storyFlags = $storyFlags
        poeSouls = $poeSouls
        goldenBugs = $goldenBugs
        fusedShadows = $fusedShadows
        mirrorShards = $mirrorShards
        faronTears = $faronTears
        eldinTears = $eldinTears
        lanayruTears = $lanayruTears
        gameOvers = $gameOvers
        actors = $actors
        gameStateEngine = 'tp-gz2e01-v2'
        supportedSet = 'RetroAchievements 3934 / GZ2E01 USA'
        eventBitsHex = (Convert-BytesToHex $eventBytes)
        tempBitsHex = (Convert-BytesToHex $tempEventBytes)
        stateFlags = $stateFlags
        inventory = if ($null -ne $inventoryBytes) { @($inventoryBytes | ForEach-Object { [int]$_ }) } else { @() }
        maxLife = $maxLife
        life = $life
        maxHearts = $maxHearts
        currentHearts = $currentHearts
        rupees = $rupees
        bottleCount = $bottleCount
        magicArmorOwned = [bool]$magicArmorOwned
        fishingCounts = @($fishingCounts)
        miniGameStats = $miniGameStats
        pollMs = $PollMs
    }
}

$shared = $null
$lastSerialized = ''
$lastHeartbeat = 0L
$stageReadFailures = 0

try {
    while ($true) {
        try {
            $null = Get-Process -Id $TargetPid -ErrorAction Stop
        } catch {
            Write-State @{ ok = $false; attached = $false; processId = $TargetPid; error = 'Dolphin process exited.' }
            break
        }

        if ($null -eq $shared -or $shared.View -eq [IntPtr]::Zero) {
            if ($null -ne $shared) { Close-DolphinSharedMemory $shared }
            $shared = Open-DolphinSharedMemory
            if ($shared.View -eq [IntPtr]::Zero) {
                Write-State @{
                    ok = $false
                    attached = $false
                    processId = $TargetPid
                    mappingOpen = $false
                    sharedMemoryName = $shared.Name
                    expectedGameCode = (Get-ExpectedGameCode)
                    hookSource = 'dolphin-shared-memory'
                    error = "Dolphin shared memory not available yet. $($shared.Errors)"
                }
                Start-Sleep -Milliseconds ([Math]::Max(500, $PollMs))
                $shared = $null
                continue
            }
        }

        $header = Read-HeaderState $shared
        if ($null -eq $header) {
            Write-State @{
                ok = $false
                attached = $false
                processId = $TargetPid
                mappingOpen = $true
                sharedMemoryName = $shared.Name
                hookSource = 'dolphin-shared-memory'
                error = 'Shared memory opened, but MEM1 header could not be read.'
            }
            Start-Sleep -Milliseconds ([Math]::Max(250, $PollMs))
            continue
        }

        $expected = Get-ExpectedGameCode
        $gameCode = if ($header.Supported) { $header.GameCode } elseif ($expected -and $versions.ContainsKey($expected)) { $expected } else { '' }

        if (-not $header.Magic -or -not $header.Supported) {
            $displayCode = if ($header.GameCode) { $header.GameCode } else { '(blank)' }
            Write-State @{
                ok = $false
                attached = $false
                processId = $TargetPid
                mappingOpen = $true
                sharedMemoryName = $shared.Name
                headerGameCode = $header.GameCode
                headerMagic = [bool]$header.Magic
                expectedGameCode = $expected
                hookSource = 'dolphin-shared-memory'
                error = "Shared memory is open; waiting for a valid TP MEM1 header (code=$displayCode, magic=$($header.Magic))."
            }
            Start-Sleep -Milliseconds ([Math]::Max(250, $PollMs))
            continue
        }

        $state = Read-CurrentState $shared $gameCode
        if ($null -eq $state) {
            $stageReadFailures++
            if ($stageReadFailures -eq 1 -or ($stageReadFailures % 10) -eq 0) {
                $version = $versions[$gameCode]
                $stageOffset = if ($version) { Guest-To-Offset ([uint64]$version.StartStage) } else { 0 }
                Write-State @{
                    ok = $false
                    attached = $false
                    processId = $TargetPid
                    gameCode = $gameCode
                    mappingOpen = $true
                    sharedMemoryName = $shared.Name
                    headerMagic = [bool]$header.Magic
                    stageOffset = ('0x{0:X}' -f $stageOffset)
                    hookSource = 'dolphin-shared-memory'
                    error = "TP shared memory is attached, but the current stage is not readable yet (attempt $stageReadFailures)."
                }
            }
            Start-Sleep -Milliseconds ([Math]::Max(50, $PollMs))
            continue
        }
        $stageReadFailures = 0

        $compare = ($state | ConvertTo-Json -Compress -Depth 6)
        $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        if ($compare -ne $lastSerialized -or ($now - $lastHeartbeat) -ge 1000) {
            Write-State $state
            $lastSerialized = $compare
            $lastHeartbeat = $now
        }

        Start-Sleep -Milliseconds ([Math]::Max(50, $PollMs))
    }
}
catch {
    $errorSharedName = "dolphin-emu.$TargetPid"
    $errorMappingOpen = $false
    if ($null -ne $shared) {
        $errorSharedName = $shared.Name
        $errorMappingOpen = ($shared.View -ne [IntPtr]::Zero)
    }
    Write-State @{
        ok = $false
        attached = $false
        processId = $TargetPid
        sharedMemoryName = $errorSharedName
        mappingOpen = $errorMappingOpen
        hookSource = 'dolphin-shared-memory'
        error = $_.Exception.Message
    }
    exit 3
}
finally {
    Close-DolphinSharedMemory $shared
}

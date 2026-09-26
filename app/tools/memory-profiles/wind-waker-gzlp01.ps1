'use strict' # marker only for grep; harmless PowerShell string expression
# Wind Waker PAL (GZLP01) read-only GameMemoryProfile.
# Addresses are derived from the PAL libtww/tww-gz symbols and cross-checked
# against Dolphin's GZLP01.ini. This file never writes to emulated memory.

$script:WindWakerSeaRooms = @{
    0  = 'Sea Floor'
    1  = 'Forsaken Fortress Sector'
    2  = 'Star Island'
    3  = 'Northern Fairy Island'
    4  = 'Gale Isle'
    5  = 'Crescent Moon Island'
    6  = 'Seven-Star Isles'
    7  = 'Overlook Island'
    8  = 'Four-Eye Reef'
    9  = 'Mother and Child Isles'
    10 = 'Spectacle Island'
    11 = 'Windfall Island'
    12 = 'Pawprint Isle'
    13 = 'Dragon Roost Island'
    14 = 'Flight Control Platform'
    15 = 'Western Fairy Island'
    16 = 'Rock Spire Isle'
    17 = 'Tingle Island'
    18 = 'Northern Triangle Island'
    19 = 'Eastern Fairy Island'
    20 = 'Fire Mountain'
    21 = 'Star Belt Archipelago'
    22 = 'Three-Eye Reef'
    23 = 'Greatfish Isle'
    24 = 'Cyclops Reef'
    25 = 'Six-Eye Reef'
    26 = 'Tower of the Gods Sector'
    27 = 'Eastern Triangle Island'
    28 = 'Thorned Fairy Island'
    29 = 'Needle Rock Isle'
    30 = 'Islet of Steel'
    31 = 'Stone Watcher Island'
    32 = 'Southern Triangle Island'
    33 = 'Private Oasis'
    34 = 'Bomb Island'
    35 = "Bird's Peak Rock"
    36 = 'Diamond Steppe Island'
    37 = 'Five-Eye Reef'
    38 = 'Shark Island'
    39 = 'Southern Fairy Island'
    40 = 'Ice Ring Isle'
    41 = 'Forest Haven'
    42 = 'Cliff Plateau Isles'
    43 = 'Horseshoe Island'
    44 = 'Outset Island'
    45 = 'Headstone Island'
    46 = 'Two-Eye Reef'
    47 = 'Angular Isles'
    48 = 'Boating Course'
    49 = 'Five-Star Isles'
}

$script:WindWakerStageLabels = @{
    'sea'     = 'The Great Sea'
    'A_mori'  = 'Outset Island Fairy Woods'
    'LinkRM'  = "Link's House"
    'LinkUG'  = "Underneath Link's House"
    'Ojhous'  = "Orca's Room"
    'Ojhous2' = "Sturgeon's Room"
    'MajyuE'  = 'Forsaken Fortress Exterior'
    'majroom' = 'Forsaken Fortress Interior'
    'Mjtower' = 'Forsaken Fortress Tower'
    'ma2room' = 'Forsaken Fortress Interior'
    'M2tower' = 'Forsaken Fortress Tower'
    'M2ganon' = "Forsaken Fortress Ganon's Room"
    'ma3room' = 'Forsaken Fortress Interior'
    'Asoko'   = 'Pirate Ship Interior'
    'Atorizk' = 'Rito Aerie'
    'M_NewD2' = 'Dragon Roost Cavern'
    'M_Dra09' = 'Dragon Roost Cavern Miniboss'
    'M_DragB' = 'Dragon Roost Cavern Gohma'
    'Omori'   = 'Forest Haven'
    'kindan'  = 'Forbidden Woods'
    'kinMB'   = 'Forbidden Woods Miniboss'
    'kinBOSS' = 'Forbidden Woods Kalle Demos'
    'Siren'   = 'Tower of the Gods'
    'SirenMB' = 'Tower of the Gods Miniboss'
    'SirenB'  = 'Tower of the Gods Gohdan'
    'Hyrule'  = 'Hyrule Castle'
    'Hyroom'  = 'Hyrule Castle Interior'
    'kenroom' = 'Master Sword Chamber'
    'M_Dai'   = 'Earth Temple'
    'M_DaiMB' = 'Earth Temple Miniboss'
    'M_DaiB'  = 'Earth Temple Jalhalla'
    'kaze'    = 'Wind Temple'
    'kazeMB'  = 'Wind Temple Miniboss'
    'kazeB'   = 'Wind Temple Molgera'
    'GanonA'  = "Ganon's Tower Entrance"
    'GanonB'  = "Ganon's Tower"
    'GanonC'  = "Ganon's Tower"
    'GanonD'  = "Ganon's Tower"
    'GanonE'  = "Ganon's Tower"
    'GanonJ'  = "Ganon's Tower Maze"
    'GanonK'  = 'Puppet Ganon'
    'GanonL'  = "Ganon's Tower"
    'GanonM'  = 'Phantom Ganon'
    'GanonN'  = "Ganon's Tower"
    'GTower'  = "Ganon's Tower Rooftop"
    'Cave09'  = 'Savage Labyrinth'
    'Cave10'  = 'Savage Labyrinth'
    'Cave11'  = 'Savage Labyrinth'
    'Pjavdou' = "Jabun's Cave"
}

function Get-WindWakerMemoryProfile {
    return [pscustomobject]@{
        Key = 'wind-waker-gc-pal'
        GameCode = 'GZLP01'
        Region = 'PAL / Europe'
        Decoder = 'wind-waker-gzlp01'
        # libtww PAL symbols:
        GameInfo = (Convert-HexToUInt64 '803CC530')
        # g_dComIfG_gameInfo + dComIfG_inf_c::play(0x12A0) + mStartStage(0x3E94)
        StartStage = (Convert-HexToUInt64 '803D1664')
        # dStage_roomControl_c::mStayNo
        StayRoom = (Convert-HexToUInt64 '803FE278')
        StageAddress = (Convert-HexToUInt64 '803D1664')
    }
}

function Test-WindWakerStageCode([string]$value) {
    if ([string]::IsNullOrWhiteSpace($value)) { return $false }
    return $value -match '^[A-Za-z0-9_]{2,8}$'
}

function Get-WindWakerAreaLabel([string]$stageCode, [int]$room) {
    if ($stageCode -eq 'sea' -and $script:WindWakerSeaRooms.ContainsKey($room)) {
        return [string]$script:WindWakerSeaRooms[$room]
    }
    if ($script:WindWakerStageLabels.ContainsKey($stageCode)) {
        return [string]$script:WindWakerStageLabels[$stageCode]
    }
    return $stageCode
}

function Read-WindWakerGzlp01State($shared, $profile) {
    if ($null -eq $profile) { return $null }

    $stageBytes = Read-SharedBytes $shared.View (Guest-To-Offset ([uint64]$profile.StartStage)) 12
    if ($null -eq $stageBytes -or $stageBytes.Length -lt 12) { return $null }

    $stageCode = Get-AsciiSafe $stageBytes 0 8
    if (-not (Test-WindWakerStageCode $stageCode)) { return $null }

    $pointUnsigned = ([int]$stageBytes[8] -shl 8) -bor [int]$stageBytes[9]
    $point = if ($pointUnsigned -ge 0x8000) { $pointUnsigned - 0x10000 } else { $pointUnsigned }
    $startRoom = To-SignedByte $stageBytes[10]
    $layer = To-SignedByte $stageBytes[11]

    $stayBytes = Read-SharedBytes $shared.View (Guest-To-Offset ([uint64]$profile.StayRoom)) 1
    $room = if ($null -ne $stayBytes -and $stayBytes.Length -ge 1) { To-SignedByte $stayBytes[0] } else { $startRoom }

    # dSv_player_status_a_c begins at g_dComIfG_gameInfo.
    # 0x00 max life, 0x02 current life, 0x04 rupees; all are big-endian u16.
    $statusBytes = Read-SharedBytes $shared.View (Guest-To-Offset ([uint64]$profile.GameInfo)) 6
    if ($null -eq $statusBytes -or $statusBytes.Length -lt 6) { return $null }

    $maxLife = Read-BigEndianUInt16 ([byte[]]$statusBytes[0..1])
    $life = Read-BigEndianUInt16 ([byte[]]$statusBytes[2..3])
    $rupees = Read-BigEndianUInt16 ([byte[]]$statusBytes[4..5])

    # Wind Waker stores one full heart as 0x10 health units.
    $maxHearts = if ($null -ne $maxLife -and $maxLife -gt 0 -and $maxLife -le 0x200) {
        [Math]::Round($maxLife / 16.0, 2)
    } else { $null }
    $currentHearts = if ($null -ne $life -and $life -ge 0 -and $life -le 0x200) {
        [Math]::Round($life / 16.0, 2)
    } else { $null }
    if ($null -ne $maxLife -and $null -ne $life -and $maxLife -gt 0 -and $life -gt $maxLife) {
        return $null
    }

    $stageLabel = Get-WindWakerAreaLabel $stageCode $room
    $kind = if ($stageCode -eq 'sea') { 'area' } else { 'stage' }

    return [ordered]@{
        ok = $true
        attached = $true
        processId = $TargetPid
        gameCode = 'GZLP01'
        region = $profile.Region
        sharedMemoryName = $shared.Name
        mappingOpen = $true
        mem1Base = ('shared:+0x0 (view 0x{0:X})' -f $shared.View.ToInt64())
        hookSource = 'dolphin-shared-memory'
        memoryProvider = 'dolphin-shared-memory'
        memoryProfile = $profile.Key
        stageCode = $stageCode
        stageName = $stageLabel
        rawStageName = if ($script:WindWakerStageLabels.ContainsKey($stageCode)) { $script:WindWakerStageLabels[$stageCode] } else { $stageCode }
        kind = $kind
        mapped = $true
        startRoom = $startRoom
        room = $room
        layer = $layer
        point = $point
        maxLife = $maxLife
        life = $life
        maxHearts = $maxHearts
        currentHearts = $currentHearts
        rupees = $rupees
        gameStateEngine = 'wind-waker-gzlp01-v1'
        supportedSet = 'RetroAchievements 9190 / GZLP01 PAL'
        pollMs = $PollMs
    }
}

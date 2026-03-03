# Crear Excel multiplataforma con ImportExcel
Import-Module ImportExcel

# Nombre del archivo a generar
$ExcelFile = "$PWD/DiagramaMarketplace.xlsx"

# Definir los datos del diagrama
$Diagrama = @(
    @{Fila=1; Col=2; Titulo="Roles"; Nota="Usuario selecciona Cliente o Profesional"},
    @{Fila=3; Col=2; Titulo="Card Destacada"; Nota="Promociona servicios o profesionales"},
    @{Fila=5; Col=2; Titulo="Sección Profesionales"; Nota="Listado de profesionales disponibles"},
    @{Fila=7; Col=2; Titulo="Búsqueda Profesional"; Nota="Permite filtrar por ciudad y especialidad"},
    @{Fila=9; Col=4; Titulo="Integración de Pago"; Nota="Procesamiento de pagos seguro"},
    @{Fila=11; Col=4; Titulo="Panel Admin"; Nota="Gestión de usuarios, servicios y estadísticas"}
)

# Crear un array para Export-Excel
$ExcelData = @()
foreach ($item in $Diagrama) {
    $ExcelData += [PSCustomObject]@{
        Fila = $item.Fila
        Columna = $item.Col
        Titulo = $item.Titulo
        Nota = $item.Nota
    }
}

# Exportar a Excel con formato
$ExcelData | Export-Excel -Path $ExcelFile -WorksheetName "Diagrama" -AutoSize -BoldTopRow -FreezeTopRow

# Abrir el archivo (si querés ver en Linux, depende del visor que tengas)
Write-Host "Archivo generado: $ExcelFile"

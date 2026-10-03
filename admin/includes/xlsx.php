<?php
/* ============================================================
   admin/includes/xlsx.php — تولید فایل Excel (xlsx) بدون نیاز به
   کتابخانه خارجی یا افزونه ZipArchive.
   فایل زیپ با روش «بدون فشرده‌سازی» (store) ساخته می‌شود که برای
   اکسل کاملاً معتبر است.
   ============================================================ */

class EplakXlsxWriter
{
    /** @var array<int, array{name: string, rows: array}> */
    private array $sheets = [];

    /**
     * افزودن یک شیت
     * @param string $name نام شیت
     * @param array  $rows آرایه‌ای از سطرها؛ هر سطر آرایه‌ای از ستون‌ها
     */
    public function addSheet(string $name, array $rows): void
    {
        $safe = preg_replace('/[\\\\\/\?\*\[\]:]/', '-', $name);
        if (trim($safe) === '') { $safe = 'Sheet'; }
        /* محدودیت اکسل: نام شیت حداکثر ۳۱ نویسه — بدون وابستگی به mbstring */
        if (function_exists('mb_substr')) {
            $safe = mb_substr($safe, 0, 31, 'UTF-8');
        } elseif (strlen($safe) > 31) {
            preg_match_all('/./us', $safe, $m);
            $safe = implode('', array_slice($m[0], 0, 31));
        }
        $this->sheets[] = ['name' => $safe, 'rows' => $rows];
    }

    /** تولید رشته باینری فایل xlsx */
    public function build(): string
    {
        if (!$this->sheets) {
            $this->addSheet('Sheet1', [['']]);
        }

        $files = [];

        /* ریشه بسته */
        $files['[Content_Types].xml'] = $this->contentTypes();
        $files['_rels/.rels']         = $this->rootRels();
        $files['xl/workbook.xml']     = $this->workbook();
        $files['xl/_rels/workbook.xml.rels'] = $this->workbookRels();

        foreach ($this->sheets as $i => $sheet) {
            $files['xl/worksheets/sheet' . ($i + 1) . '.xml'] = $this->worksheet($sheet['rows']);
        }

        return $this->zip($files);
    }

    /** ذخیره در مسیر مشخص */
    public function save(string $path): bool
    {
        return file_put_contents($path, $this->build()) !== false;
    }

    /**
     * ارسال مستقیم برای دانلود
     * @param string $filename  نام فایل (می‌تواند فارسی باشد)
     * @param string $asciiName نام جایگزین لاتین برای سازگاری با مرورگرها
     */
    public function download(string $filename, string $asciiName = ''): void
    {
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        $filename = preg_replace('/[^\p{L}\p{N}_\-\.]/u', '_', $filename);

        /* نام لاتینِ ایمن برای مرورگرهایی که filename* را نمی‌فهمند */
        $asciiName = preg_replace('/[^A-Za-z0-9_\-\.]/', '', $asciiName);
        if ($asciiName === '' || $asciiName === '.xlsx') {
            $asciiName = 'eplak-export-' . date('Y-m-d') . '.xlsx';
        }

        header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        header('Content-Disposition: attachment; filename="' . $asciiName . '"; filename*=UTF-8\'\'' . rawurlencode($filename));
        header('Cache-Control: no-store, no-cache, must-revalidate');
        header('X-Content-Type-Options: nosniff');
        echo $this->build();
        exit;
    }

    /* ─────────────────────────────────────────────────────────
       تولید اجزای بسته
    ───────────────────────────────────────────────────────── */
    private function contentTypes(): string
    {
        $xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            . '<Default Extension="xml" ContentType="application/xml"/>'
            . '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>';

        foreach ($this->sheets as $i => $sheet) {
            $xml .= '<Override PartName="/xl/worksheets/sheet' . ($i + 1) . '.xml"'
                 .  ' ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
        }

        $xml .= '</Types>';
        return $xml;
    }

    private function rootRels(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            . '</Relationships>';
    }

    private function workbook(): string
    {
        $xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
            . ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>';
        foreach ($this->sheets as $i => $sheet) {
            $xml .= '<sheet name="' . $this->esc($sheet['name']) . '" sheetId="' . ($i + 1) . '" r:id="rId' . ($i + 1) . '"/>';
        }
        $xml .= '</sheets></workbook>';
        return $xml;
    }

    private function workbookRels(): string
    {
        $xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
        foreach ($this->sheets as $i => $sheet) {
            $xml .= '<Relationship Id="rId' . ($i + 1) . '"'
                 .  ' Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"'
                 .  ' Target="worksheets/sheet' . ($i + 1) . '.xml"/>';
        }
        $xml .= '</Relationships>';
        return $xml;
    }

    private function worksheet(array $rows): string
    {
        $xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';

        $r = 1;
        foreach ($rows as $row) {
            $xml .= '<row r="' . $r . '">';
            $c = 0;
            foreach ($row as $value) {
                $ref = $this->colName($c) . $r;
                if (is_numeric($value) && !is_string($value) || (is_string($value) && is_numeric($value) && preg_match('/^-?\d+(\.\d+)?$/', $value))) {
                    /* عدد */
                    $xml .= '<c r="' . $ref . '"><v>' . $this->esc((string)$value) . '</v></c>';
                } else {
                    /* متن (رشته درونی — بدون نیاز به جدول رشته‌های مشترک) */
                    $xml .= '<c r="' . $ref . '" t="inlineStr"><is><t xml:space="preserve">'
                         .  $this->esc((string)$value) . '</t></is></c>';
                }
                $c++;
            }
            $xml .= '</row>';
            $r++;
        }

        $xml .= '</sheetData></worksheet>';
        return $xml;
    }

    /* ─────────────────────────────────────────────────────────
       کمکی‌ها
    ───────────────────────────────────────────────────────── */
    private function esc(string $value): string
    {
        return htmlspecialchars($value, ENT_XML1 | ENT_COMPAT, 'UTF-8');
    }

    private function colName(int $index): string
    {
        $name = '';
        $index += 1;
        while ($index > 0) {
            $mod = ($index - 1) % 26;
            $name = chr(65 + $mod) . $name;
            $index = intdiv($index - 1, 26);
        }
        return $name;
    }

    /** ساخت بسته زیپ با روش store (بدون فشرده‌سازی) */
    private function zip(array $files): string
    {
        $out = '';
        $central = '';
        $offset = 0;
        $time = 0;         /* ساعت/دقیقه/ثانیهٔ داس */
        $date = 0x5821;    /* تاریخ داس: 2024-01-01 */

        foreach ($files as $name => $data) {
            $crc = crc32($data);
            $len = strlen($data);
            $nameLen = strlen($name);

            $local = pack('V', 0x04034b50)
                   . pack('v', 20)      /* version needed */
                   . pack('v', 0)       /* flags */
                   . pack('v', 0)       /* method: store */
                   . pack('v', $time)
                   . pack('v', $date)
                   . pack('V', $crc)
                   . pack('V', $len)
                   . pack('V', $len)
                   . pack('v', $nameLen)
                   . pack('v', 0)
                   . $name;

            $out .= $local . $data;

            $central .= pack('V', 0x02014b50)
                      . pack('v', 20)   /* version made by */
                      . pack('v', 20)   /* version needed */
                      . pack('v', 0)    /* flags */
                      . pack('v', 0)    /* method */
                      . pack('v', $time)
                      . pack('v', $date)
                      . pack('V', $crc)
                      . pack('V', $len)
                      . pack('V', $len)
                      . pack('v', $nameLen)
                      . pack('v', 0)    /* extra */
                      . pack('v', 0)    /* comment */
                      . pack('v', 0)    /* disk */
                      . pack('v', 0)    /* internal attrs */
                      . pack('V', 0)    /* external attrs */
                      . pack('V', $offset)
                      . $name;

            $offset += strlen($local) + $len;
        }

        $end = pack('V', 0x06054b50)
             . pack('v', 0)
             . pack('v', 0)
             . pack('v', count($files))
             . pack('v', count($files))
             . pack('V', strlen($central))
             . pack('V', $offset)
             . pack('v', 0);

        return $out . $central . $end;
    }
}

# -*- coding: utf-8 -*-
# 抖音关键词搜索 - 腾讯云 SCF 函数（直连抖音官方接口，免第三方、免额度）
#
# 原理：在服务端用纯 Python 实现抖音网页版 a_bogus 签名，直接请求官方搜索接口，
#       提取前三页视频的标题 / 文案 / 链接。不依赖任何第三方 API，不消耗额度。
#
# 部署步骤：
#   1) 腾讯云 SCF 控制台新建 Python 3.9 函数，把本文件粘贴为 index.py（入口 handler），
#      建议把执行超时设置为 30 秒。
#   2) 在函数「环境变量」里配置：
#         DOUYIN_COOKIE = 你的抖音网页版 Cookie（必填）
#             获取方法：浏览器登录 https://www.douyin.com 后，按 F12 打开开发者工具 →
#             Network 面板刷新任意请求 → 找到 Cookie 请求头，整段复制填进来。
#   3) 配置 API 网关触发器（GET 方式即可，代码已自带 CORS 头），得到访问地址。
#   4) 把该地址填到 douyin/search.html 顶部的 SEARCH_API 常量。
#
# 请求（GET）：
#   ?action=search&keyword=美食&pages=3
#
# 返回：
#   { "code": 0, "keyword": "美食",
#     "items": [ {"page":1,"title":"...","desc":"...","url":"...","author":"...","aweme_id":"..."}, ... ] }
#
# 注意：抖音会不定期更新签名算法与风控策略，若某天失效（返回 status_code 非 0），
#       通常是 Cookie 过期或 a_bogus 算法需同步更新。

import json
import os
import re
import urllib.parse
import urllib.request


# ==================== 纯标准库 SM3（国密哈希）实现 ====================
# 用于替换 gmssl 依赖，避免在 SCF 里打包第三方库。

def _rotl(x, n):
    n %= 32
    return ((x << n) | (x >> (32 - n))) & 0xFFFFFFFF


def _sm3_hash(byte_list):
    iv = [0x7380166F, 0x4914B2B9, 0x172442D7, 0xDA8A0600,
          0xA96F30BC, 0x163138AA, 0xE38DEE4D, 0xB0FB0E4E]

    def tfunc(j):
        return 0x79CC4519 if j < 16 else 0x7A879D8A

    def ff(x, y, z, j):
        return (x ^ y ^ z) & 0xFFFFFFFF if j < 16 else ((x & y) | (x & z) | (y & z)) & 0xFFFFFFFF

    def gg(x, y, z, j):
        return (x ^ y ^ z) & 0xFFFFFFFF if j < 16 else ((x & y) | ((~x) & z)) & 0xFFFFFFFF

    def p0(x):
        return (x ^ _rotl(x, 9) ^ _rotl(x, 17)) & 0xFFFFFFFF

    def p1(x):
        return (x ^ _rotl(x, 15) ^ _rotl(x, 23)) & 0xFFFFFFFF

    msg = list(byte_list)
    bit_len = (len(msg) * 8) & 0xFFFFFFFFFFFFFFFF
    msg.append(0x80)
    while len(msg) % 64 != 56:
        msg.append(0)
    msg += [(bit_len >> (8 * i)) & 0xFF for i in range(7, -1, -1)]

    v = list(iv)
    for off in range(0, len(msg), 64):
        blk = msg[off:off + 64]
        w = [0] * 68
        for i in range(16):
            w[i] = (blk[i * 4] << 24) | (blk[i * 4 + 1] << 16) | (blk[i * 4 + 2] << 8) | blk[i * 4 + 3]
        for i in range(16, 68):
            w[i] = p1(w[i - 16] ^ w[i - 9] ^ _rotl(w[i - 3], 15)) ^ _rotl(w[i - 13], 7) ^ w[i - 6]
        w1 = [w[i] ^ w[i + 4] for i in range(64)]
        a, b, c, d, e, f, g, h = v
        for j in range(64):
            ss1 = _rotl((_rotl(a, 12) + e + _rotl(tfunc(j), j)) & 0xFFFFFFFF, 7)
            ss2 = ss1 ^ _rotl(a, 12)
            tt1 = (ff(a, b, c, j) + d + ss2 + w1[j]) & 0xFFFFFFFF
            tt2 = (gg(e, f, g, j) + h + ss1 + w[j]) & 0xFFFFFFFF
            d, c, b, a = c, _rotl(b, 9), a, tt1
            h, g, f, e = g, _rotl(f, 19), e, p0(tt2)
        for k in range(8):
            v[k] = (v[k] ^ [a, b, c, d, e, f, g, h][k]) & 0xFFFFFFFF
    return ''.join('%08x' % x for x in v)


# ==================== a_bogus 签名（移植自开源项目） ====================
# 原始来源: https://github.com/JoeanAmier/TikTokDownloader (GPL-3.0)
# 移植自:   https://github.com/Evil0ctal/Douyin_TikTok_Download_API (Apache-2.0)
"""
Original Author:
This file is from https://github.com/JoeanAmier/TikTokDownloader
And is licensed under the GNU General Public License v3.0
If you use this code, please keep this license and the original author information.

Modified by:
And this file is now a part of the https://github.com/Evil0ctal/Douyin_TikTok_Download_API open-source project.
This project is licensed under the Apache License 2.0, and the original author information is kept.

Purpose:
This file is used to generate the `a_bogus` parameter for the Douyin Web API.

Changes Made:
1. Changed the ua_code to compatible with the current config file User-Agent string in https://github.com/Evil0ctal/Douyin_TikTok_Download_API/blob/main/crawlers/douyin/web/config.yaml
"""

from random import choice
from random import randint
from random import random
from re import compile
from time import time
from urllib.parse import urlencode
from urllib.parse import quote

__all__ = ["ABogus", ]


class ABogus:
    __filter = compile(r'%([0-9A-F]{2})')
    __arguments = [0, 1, 14]
    __ua_key = "\u0000\u0001\u000e"
    __end_string = "cus"
    __version = [1, 0, 1, 5]
    __browser = "1536|742|1536|864|0|0|0|0|1536|864|1536|864|1536|742|24|24|MacIntel"
    __reg = [
        1937774191,
        1226093241,
        388252375,
        3666478592,
        2842636476,
        372324522,
        3817729613,
        2969243214,
    ]
    __str = {
        "s0": "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",
        "s1": "Dkdpgh4ZKsQB80/Mfvw36XI1R25+WUAlEi7NLboqYTOPuzmFjJnryx9HVGcaStCe=",
        "s2": "Dkdpgh4ZKsQB80/Mfvw36XI1R25-WUAlEi7NLboqYTOPuzmFjJnryx9HVGcaStCe=",
        "s3": "ckdp1h4ZKsUB80/Mfvw36XIgR25+WQAlEi7NLboqYTOPuzmFjJnryx9HVGDaStCe",
        "s4": "Dkdpgh2ZmsQB80/MfvV36XI1R45-WUAlEixNLwoqYTOPuzKFjJnry79HbGcaStCe",
    }

    def __init__(self,
                 # user_agent: str = USERAGENT,
                 platform: str = None, ):
        self.chunk = []
        self.size = 0
        self.reg = self.__reg[:]
        # self.ua_code = self.generate_ua_code(user_agent)
        # Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36
        self.ua_code = [
            76,
            98,
            15,
            131,
            97,
            245,
            224,
            133,
            122,
            199,
            241,
            166,
            79,
            34,
            90,
            191,
            128,
            126,
            122,
            98,
            66,
            11,
            14,
            40,
            49,
            110,
            110,
            173,
            67,
            96,
            138,
            252]
        self.browser = self.generate_browser_info(
            platform) if platform else self.__browser
        self.browser_len = len(self.browser)
        self.browser_code = self.char_code_at(self.browser)

    @classmethod
    def list_1(cls, random_num=None, a=170, b=85, c=45, ) -> list:
        return cls.random_list(
            random_num,
            a,
            b,
            1,
            2,
            5,
            c & a,
        )

    @classmethod
    def list_2(cls, random_num=None, a=170, b=85, ) -> list:
        return cls.random_list(
            random_num,
            a,
            b,
            1,
            0,
            0,
            0,
        )

    @classmethod
    def list_3(cls, random_num=None, a=170, b=85, ) -> list:
        return cls.random_list(
            random_num,
            a,
            b,
            1,
            0,
            5,
            0,
        )

    @staticmethod
    def random_list(
            a: float = None,
            b=170,
            c=85,
            d=0,
            e=0,
            f=0,
            g=0,
    ) -> list:
        r = a or (random() * 10000)
        v = [
            r,
            int(r) & 255,
            int(r) >> 8,
        ]
        s = v[1] & b | d
        v.append(s)
        s = v[1] & c | e
        v.append(s)
        s = v[2] & b | f
        v.append(s)
        s = v[2] & c | g
        v.append(s)
        return v[-4:]

    @staticmethod
    def from_char_code(*args):
        return "".join(chr(code) for code in args)

    @classmethod
    def generate_string_1(
            cls,
            random_num_1=None,
            random_num_2=None,
            random_num_3=None,
    ):
        return cls.from_char_code(*cls.list_1(random_num_1)) + cls.from_char_code(
            *cls.list_2(random_num_2)) + cls.from_char_code(*cls.list_3(random_num_3))

    def generate_string_2(
            self,
            url_params: str,
            method="GET",
            start_time=0,
            end_time=0,
    ) -> str:
        a = self.generate_string_2_list(
            url_params,
            method,
            start_time,
            end_time,
        )
        e = self.end_check_num(a)
        a.extend(self.browser_code)
        a.append(e)
        return self.rc4_encrypt(self.from_char_code(*a), "y")

    def generate_string_2_list(
            self,
            url_params: str,
            method="GET",
            start_time=0,
            end_time=0,
    ) -> list:
        start_time = start_time or int(time() * 1000)
        end_time = end_time or (start_time + randint(4, 8))
        params_array = self.generate_params_code(url_params)
        method_array = self.generate_method_code(method)
        return self.list_4(
            (end_time >> 24) & 255,
            params_array[21],
            self.ua_code[23],
            (end_time >> 16) & 255,
            params_array[22],
            self.ua_code[24],
            (end_time >> 8) & 255,
            (end_time >> 0) & 255,
            (start_time >> 24) & 255,
            (start_time >> 16) & 255,
            (start_time >> 8) & 255,
            (start_time >> 0) & 255,
            method_array[21],
            method_array[22],
            int(end_time / 256 / 256 / 256 / 256) >> 0,
            int(start_time / 256 / 256 / 256 / 256) >> 0,
            self.browser_len,
        )

    @staticmethod
    def reg_to_array(a):
        o = [0] * 32
        for i in range(8):
            c = a[i]
            o[4 * i + 3] = (255 & c)
            c >>= 8
            o[4 * i + 2] = (255 & c)
            c >>= 8
            o[4 * i + 1] = (255 & c)
            c >>= 8
            o[4 * i] = (255 & c)

        return o

    def compress(self, a):
        f = self.generate_f(a)
        i = self.reg[:]
        for o in range(64):
            c = self.de(i[0], 12) + i[4] + self.de(self.pe(o), o)
            c = (c & 0xFFFFFFFF)
            c = self.de(c, 7)
            s = (c ^ self.de(i[0], 12)) & 0xFFFFFFFF

            u = self.he(o, i[0], i[1], i[2])
            u = (u + i[3] + s + f[o + 68]) & 0xFFFFFFFF

            b = self.ve(o, i[4], i[5], i[6])
            b = (b + i[7] + c + f[o]) & 0xFFFFFFFF

            i[3] = i[2]
            i[2] = self.de(i[1], 9)
            i[1] = i[0]
            i[0] = u

            i[7] = i[6]
            i[6] = self.de(i[5], 19)
            i[5] = i[4]
            i[4] = (b ^ self.de(b, 9) ^ self.de(b, 17)) & 0xFFFFFFFF

        for l in range(8):
            self.reg[l] = (self.reg[l] ^ i[l]) & 0xFFFFFFFF

    @classmethod
    def generate_f(cls, e):
        r = [0] * 132

        for t in range(16):
            r[t] = (e[4 * t] << 24) | (e[4 * t + 1] <<
                                       16) | (e[4 * t + 2] << 8) | e[4 * t + 3]
            r[t] &= 0xFFFFFFFF

        for n in range(16, 68):
            a = r[n - 16] ^ r[n - 9] ^ cls.de(r[n - 3], 15)
            a = a ^ cls.de(a, 15) ^ cls.de(a, 23)
            r[n] = (a ^ cls.de(r[n - 13], 7) ^ r[n - 6]) & 0xFFFFFFFF

        for n in range(68, 132):
            r[n] = (r[n - 68] ^ r[n - 64]) & 0xFFFFFFFF

        return r

    @staticmethod
    def pad_array(arr, length=60):
        while len(arr) < length:
            arr.append(0)
        return arr

    def fill(self, length=60):
        size = 8 * self.size
        self.chunk.append(128)
        self.chunk = self.pad_array(self.chunk, length)
        for i in range(4):
            self.chunk.append((size >> 8 * (3 - i)) & 255)

    @staticmethod
    def list_4(
            a: int,
            b: int,
            c: int,
            d: int,
            e: int,
            f: int,
            g: int,
            h: int,
            i: int,
            j: int,
            k: int,
            m: int,
            n: int,
            o: int,
            p: int,
            q: int,
            r: int,
    ) -> list:
        return [
            44,
            a,
            0,
            0,
            0,
            0,
            24,
            b,
            n,
            0,
            c,
            d,
            0,
            0,
            0,
            1,
            0,
            239,
            e,
            o,
            f,
            g,
            0,
            0,
            0,
            0,
            h,
            0,
            0,
            14,
            i,
            j,
            0,
            k,
            m,
            3,
            p,
            1,
            q,
            1,
            r,
            0,
            0,
            0]

    @staticmethod
    def end_check_num(a: list):
        r = 0
        for i in a:
            r ^= i
        return r

    @classmethod
    def decode_string(cls, url_string, ):
        decoded = cls.__filter.sub(cls.replace_func, url_string)
        return decoded

    @staticmethod
    def replace_func(match):
        return chr(int(match.group(1), 16))

    @staticmethod
    def de(e, r):
        r %= 32
        return ((e << r) & 0xFFFFFFFF) | (e >> (32 - r))

    @staticmethod
    def pe(e):
        return 2043430169 if 0 <= e < 16 else 2055708042

    @staticmethod
    def he(e, r, t, n):
        if 0 <= e < 16:
            return (r ^ t ^ n) & 0xFFFFFFFF
        elif 16 <= e < 64:
            return (r & t | r & n | t & n) & 0xFFFFFFFF
        raise ValueError

    @staticmethod
    def ve(e, r, t, n):
        if 0 <= e < 16:
            return (r ^ t ^ n) & 0xFFFFFFFF
        elif 16 <= e < 64:
            return (r & t | ~r & n) & 0xFFFFFFFF
        raise ValueError

    @staticmethod
    def convert_to_char_code(a):
        d = []
        for i in a:
            d.append(ord(i))
        return d

    @staticmethod
    def split_array(arr, chunk_size=64):
        result = []
        for i in range(0, len(arr), chunk_size):
            result.append(arr[i:i + chunk_size])
        return result

    @staticmethod
    def char_code_at(s):
        return [ord(char) for char in s]

    def write(self, e, ):
        self.size = len(e)
        if isinstance(e, str):
            e = self.decode_string(e)
            e = self.char_code_at(e)
        if len(e) <= 64:
            self.chunk = e
        else:
            chunks = self.split_array(e, 64)
            for i in chunks[:-1]:
                self.compress(i)
            self.chunk = chunks[-1]

    def reset(self, ):
        self.chunk = []
        self.size = 0
        self.reg = self.__reg[:]

    def sum(self, e, length=60):
        self.reset()
        self.write(e)
        self.fill(length)
        self.compress(self.chunk)
        return self.reg_to_array(self.reg)

    @classmethod
    def generate_result_unit(cls, n, s):
        r = ""
        for i, j in zip(range(18, -1, -6), (16515072, 258048, 4032, 63)):
            r += cls.__str[s][(n & j) >> i]
        return r

    @classmethod
    def generate_result_end(cls, s, e="s4"):
        r = ""
        b = ord(s[120]) << 16
        r += cls.__str[e][(b & 16515072) >> 18]
        r += cls.__str[e][(b & 258048) >> 12]
        r += "=="
        return r

    @classmethod
    def generate_result(cls, s, e="s4"):
        # r = ""
        # for i in range(len(s)//4):
        #     b = ((ord(s[i * 3]) << 16) | (ord(s[i * 3 + 1]))
        #          << 8) | ord(s[i * 3 + 2])
        #     r += cls.generate_result_unit(b, e)
        # return r

        r = []

        for i in range(0, len(s), 3):
            if i + 2 < len(s):
                n = (
                    (ord(s[i]) << 16)
                    | (ord(s[i + 1]) << 8)
                    | ord(s[i + 2])
                )
            elif i + 1 < len(s):
                n = (ord(s[i]) << 16) | (
                    ord(s[i + 1]) << 8
                )
            else:
                n = ord(s[i]) << 16

            for j, k in zip(range(18, -1, -6),
                            (0xFC0000, 0x03F000, 0x0FC0, 0x3F)):
                if j == 6 and i + 1 >= len(s):
                    break
                if j == 0 and i + 2 >= len(s):
                    break
                r.append(cls.__str[e][(n & k) >> j])

        r.append("=" * ((4 - len(r) % 4) % 4))
        return "".join(r)

    @classmethod
    def generate_args_code(cls):
        a = []
        for j in range(24, -1, -8):
            a.append(cls.__arguments[0] >> j)
        a.append(cls.__arguments[1] / 256)
        a.append(cls.__arguments[1] % 256)
        a.append(cls.__arguments[1] >> 24)
        a.append(cls.__arguments[1] >> 16)
        for j in range(24, -1, -8):
            a.append(cls.__arguments[2] >> j)
        return [int(i) & 255 for i in a]

    def generate_method_code(self, method: str = "GET") -> list[int]:
        return self.sm3_to_array(self.sm3_to_array(method + self.__end_string))
        # return self.sum(self.sum(method + self.__end_string))

    def generate_params_code(self, params: str) -> list[int]:
        return self.sm3_to_array(self.sm3_to_array(params + self.__end_string))
        # return self.sum(self.sum(params + self.__end_string))

    @classmethod
    def sm3_to_array(cls, data: str | list) -> list[int]:
        """
        代码参考: https://github.com/Johnserf-Seed/f2/blob/main/f2/utils/abogus.py

        计算请求体的 SM3 哈希值，并将结果转换为整数数组
        Calculate the SM3 hash value of the request body and convert the result to an array of integers

        Args:
            data (Union[str, List[int]]): 输入数据 (Input data).

        Returns:
            List[int]: 哈希值的整数数组 (Array of integers representing the hash value).
        """

        if isinstance(data, str):
            b = data.encode("utf-8")
        else:
            b = bytes(data)  # 将 List[int] 转换为字节数组

        # 将字节数组转换为适合 sm3.sm3_hash 函数处理的列表格式
        h = _sm3_hash(list(b))

        # 将十六进制字符串结果转换为十进制整数列表
        return [int(h[i: i + 2], 16) for i in range(0, len(h), 2)]

    @classmethod
    def generate_browser_info(cls, platform: str = "Win32") -> str:
        inner_width = randint(1280, 1920)
        inner_height = randint(720, 1080)
        outer_width = randint(inner_width, 1920)
        outer_height = randint(inner_height, 1080)
        screen_x = 0
        screen_y = choice((0, 30))
        value_list = [
            inner_width,
            inner_height,
            outer_width,
            outer_height,
            screen_x,
            screen_y,
            0,
            0,
            outer_width,
            outer_height,
            outer_width,
            outer_height,
            inner_width,
            inner_height,
            24,
            24,
            platform,
        ]
        return "|".join(str(i) for i in value_list)

    @staticmethod
    def rc4_encrypt(plaintext, key):
        s = list(range(256))
        j = 0

        for i in range(256):
            j = (j + s[i] + ord(key[i % len(key)])) % 256
            s[i], s[j] = s[j], s[i]

        i = 0
        j = 0
        cipher = []

        for k in range(len(plaintext)):
            i = (i + 1) % 256
            j = (j + s[i]) % 256
            s[i], s[j] = s[j], s[i]
            t = (s[i] + s[j]) % 256
            cipher.append(chr(s[t] ^ ord(plaintext[k])))

        return ''.join(cipher)

    def get_value(self,
                  url_params: dict | str,
                  method="GET",
                  start_time=0,
                  end_time=0,
                  random_num_1=None,
                  random_num_2=None,
                  random_num_3=None,
                  ) -> str:
        string_1 = self.generate_string_1(
            random_num_1,
            random_num_2,
            random_num_3,
        )
        string_2 = self.generate_string_2(urlencode(url_params) if isinstance(
            url_params, dict) else url_params, method, start_time, end_time, )
        string = string_1 + string_2
        # return self.generate_result(
        #     string, "s4") + self.generate_result_end(string, "s4")
        return self.generate_result(string, "s4")


# ==================== 搜索逻辑 ====================

GENERAL_SEARCH = "https://www.douyin.com/aweme/v1/web/general/search/single/"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36"

CORS_HEADERS = {
    'Content-Type': 'application/json; charset=UTF-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
}


def _json(data, status_code=200):
    return {
        'statusCode': status_code,
        'headers': CORS_HEADERS,
        'body': json.dumps(data, ensure_ascii=False),
    }


def _parse_params(event):
    raw = event.get('queryString') or event.get('queryStringParameters') or {}
    if isinstance(raw, dict):
        return raw
    params = {}
    if isinstance(raw, str) and raw:
        for part in raw.split('&'):
            if '=' in part:
                k, v = part.split('=', 1)
                params[k] = urllib.parse.unquote_plus(v)
    return params


def _base_params(keyword, offset, count, sort_type, publish_time, filter_duration):
    return {
        "device_platform": "webapp",
        "aid": "6383",
        "channel": "channel_pc_web",
        "search_channel": "aweme_general",
        "sort_type": sort_type,
        "publish_time": publish_time,
        "filter_duration": filter_duration,
        "keyword": keyword,
        "search_source": "normal_search",
        "query_correct_type": "1",
        "is_filter_search": "0",
        "offset": str(offset),
        "count": str(count),
        "pc_client_type": "1",
        "version_code": "290100",
        "version_name": "29.1.0",
        "cookie_enabled": "true",
        "screen_width": "1920",
        "screen_height": "1080",
        "browser_language": "zh-CN",
        "browser_platform": "Win32",
        "browser_name": "Chrome",
        "browser_version": "130.0.0.0",
        "browser_online": "true",
        "engine_name": "Blink",
        "engine_version": "130.0.0.0",
        "os_name": "Windows",
        "os_version": "10",
        "cpu_core_num": "12",
        "device_memory": "8",
        "platform": "PC",
        "downlink": "10",
        "effective_type": "4g",
        "round_trip_time": "0",
        "msToken": "",
    }


def _search_page(keyword, offset, cookie, count=20):
    params = _base_params(keyword, offset, count, "0", "0", "0")
    a_bogus = urllib.parse.quote(ABogus().get_value(params), safe='')
    url = GENERAL_SEARCH + "?" + urllib.parse.urlencode(params) + "&a_bogus=" + a_bogus
    req = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Referer": "https://www.douyin.com/",
        "Cookie": cookie,
    })
    resp = urllib.request.urlopen(req, timeout=20)
    return json.loads(resp.read().decode('utf-8', errors='ignore'))


def _extract_awemes(data):
    items = data.get("data") if isinstance(data, dict) else None
    if not isinstance(items, list):
        return []
    out = []
    for it in items:
        if not isinstance(it, dict):
            continue
        aweme = it.get("aweme_info") if isinstance(it.get("aweme_info"), dict) else it
        if aweme.get("aweme_id"):
            out.append(aweme)
    return out


def _norm(aweme):
    aweme_id = str(aweme.get("aweme_id") or "")
    if not aweme_id:
        return None
    desc = aweme.get("desc") or ""
    author = (aweme.get("author") or {}).get("nickname") or ""
    title = aweme.get("title") or desc
    return {
        "aweme_id": aweme_id,
        "title": title,
        "desc": desc,
        "author": author,
        "url": "https://www.douyin.com/video/" + aweme_id,
    }


def _search(keyword, pages, cookie):
    items = []
    cursor = 0
    for page in range(1, int(pages) + 1):
        data = _search_page(keyword, cursor, cookie)

        if not isinstance(data, dict):
            return None, "抖音接口未返回有效数据（可能触发验证码，请更换 Cookie）"

        sc = data.get("status_code")
        if sc not in (None, 0):
            return None, "抖音接口返回 status_code=%s（Cookie 可能过期或签名失效）" % sc

        seen = {i["aweme_id"] for i in items}
        for a in _extract_awemes(data):
            n = _norm(a)
            if n and n["aweme_id"] not in seen:
                seen.add(n["aweme_id"])
                n["page"] = page
                items.append(n)

        has_more = data.get("has_more")
        nc = data.get("cursor")
        if nc is None or has_more in (0, "0", False):
            break
        cursor = nc

    return items, None


def handler(event, context):
    method = (event.get('httpMethod') or 'GET').upper()
    if method == 'OPTIONS':
        return {'statusCode': 204, 'headers': CORS_HEADERS, 'body': ''}

    params = _parse_params(event)
    action = (params.get('action') or 'search').strip()
    if action != 'search':
        return _json({'code': 1, 'message': '未知 action，仅支持 action=search'}, 400)

    keyword = (params.get('keyword') or '').strip()
    if not keyword:
        return _json({'code': 1, 'message': '缺少 keyword 参数'}, 400)

    cookie = (os.environ.get('DOUYIN_COOKIE') or '').strip()
    if not cookie:
        return _json({'code': 1, 'message': '未配置 DOUYIN_COOKIE 环境变量，请填入抖音网页版 Cookie'}, 400)

    try:
        pages = int(params.get('pages') or 3)
    except (TypeError, ValueError):
        pages = 3
    pages = max(1, min(pages, 3))

    try:
        items, err = _search(keyword, pages, cookie)
    except Exception as e:  # noqa: BLE001
        return _json({'code': 1, 'message': '检索失败: %s' % e}, 502)

    if err:
        return _json({'code': 1, 'message': err}, 502)

    return _json({'code': 0, 'keyword': keyword, 'count': len(items), 'items': items})

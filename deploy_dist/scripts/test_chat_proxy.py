#!/usr/bin/env python3
"""
test_chat_proxy.py
==================
Kingston Engineering College — Cloudflare Worker / API Proxy Test

Tests the /api/chat endpoint to verify:
  1. Proxy is reachable (HTTP 200)
  2. OpenRouter integration works
  3. Response format is correct
  4. Latency is acceptable
  5. Cost estimate for the query

Usage:
  # Test the proxy endpoint (after Cloudflare deployment):
  python scripts/test_chat_proxy.py --proxy https://kingston.pages.dev/api/chat

  # Test directly against OpenRouter (before deployment):
  python scripts/test_chat_proxy.py --direct --api-key sk-or-...

  # Run the full 200-question comparison test:
  python scripts/openrouter_comparison_test.py
"""

import argparse
import json
import sys
import time
import urllib.request
import urllib.error


# ── Test Queries ──────────────────────────────────────────────────────

ANSWERABLE_QUERIES = [
    "What is the admission process for B.E. courses?",
    "Tell me about placements and top recruiting companies",
    "What is the NAAC accreditation grade of the college?",
    "Does the college provide hostel accommodation?",
    "What departments are available at Kingston Engineering College?",
    "What scholarship opportunities are available?",
    "Tell me about the Computer Science and Engineering department",
    "What is the fee structure for B.E. programs?",
    "How do I contact the college admission office?",
    "What library facilities are available?",
]

UNABLE_QUERIES = [
    "What is the exact fee for international students?",
    "Does the college offer dual degree programs with foreign universities?",
    "What is the student-to-faculty ratio?",
    "Tell me about the college's partnership with Google",
    "What is the average package for MBA graduates specifically?",
]

# ── Test Context (simulated RAG retrieval context) ──────────────────

SAMPLE_CONTEXT = """
[Source: admission.html — Admission Process]
Kingston Engineering College offers B.E. programs in Computer Science and Engineering,
Electronics and Communication Engineering, Mechanical Engineering, Information Technology,
and Artificial Intelligence & Data Science. Admission is based on TNEA counselling for
Tamil Nadu students and management quota for others. The college is affiliated with
Anna University and approved by AICTE.
---
[Source: placements/placement_report.html — Placement Report]
The college has a dedicated placement cell that coordinates campus recruitment drives.
Top recruiters include TCS, Infosys, Wipro, HCL, Cognizant, Zoho, and many more.
Consistent placement records with competitive packages offered to students.
---
"""


def test_proxy(proxy_url, queries, context):
    """Test the Cloudflare Worker proxy endpoint."""
    results = []
    total_tokens = 0
    total_cost = 0.0
    total_latency = 0

    print(f"\n{'='*60}")
    print(f"  PROXY ENDPOINT TEST: {proxy_url}")
    print(f"{'='*60}")

    for i, query in enumerate(queries):
        payload = json.dumps({
            "query": query,
            "retrievedContext": context,
        }).encode('utf-8')

        req = urllib.request.Request(
            proxy_url,
            data=payload,
            headers={'Content-Type': 'application/json'},
            method='POST'
        )

        start = time.time()
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                latency = (time.time() - start) * 1000
                data = json.loads(resp.read().decode('utf-8'))
                status = resp.status

                completion = None
                usage = None
                if data.get('choices') and len(data['choices']) > 0:
                    completion = data['choices'][0].get('message', {}).get('content', '')
                usage = data.get('usage', {})

                tokens = (usage.get('prompt_tokens', 0) + usage.get('completion_tokens', 0)) if usage else 0
                input_tokens = usage.get('prompt_tokens', 0) if usage else 0
                output_tokens = usage.get('completion_tokens', 0) if usage else 0
                cost = (input_tokens / 1_000_000) * 0.20 + (output_tokens / 1_000_000) * 0.40

                total_tokens += tokens
                total_cost += cost
                total_latency += latency

                result = {
                    'query': query,
                    'status': status,
                    'latency_ms': round(latency, 1),
                    'tokens': tokens,
                    'cost': cost,
                    'has_answer': bool(completion and len(completion) > 20),
                    'answer_preview': (completion or '')[:100],
                    'error': None,
                }

        except urllib.error.HTTPError as e:
            result = {
                'query': query,
                'status': e.code,
                'latency_ms': round((time.time() - start) * 1000, 1),
                'tokens': 0,
                'cost': 0,
                'has_answer': False,
                'answer_preview': '',
                'error': str(e),
            }
        except Exception as e:
            result = {
                'query': query,
                'status': 0,
                'latency_ms': round((time.time() - start) * 1000, 1),
                'tokens': 0,
                'cost': 0,
                'has_answer': False,
                'answer_preview': '',
                'error': str(e),
            }

        results.append(result)

        status_icon = '[OK]' if result['status'] == 200 and result['has_answer'] else '[FAIL]'
        print(f"\n  [{i+1}/{len(queries)}] {status_icon} Query: {query[:60]}...")
        print(f"      Status: {result['status']} | Latency: {result['latency_ms']}ms | Tokens: {result['tokens']} | Cost: ${result['cost']:.6f}")
        if result['has_answer']:
            print(f"      Answer: {result['answer_preview']}...")
        if result['error']:
            print(f"      Error: {result['error']}")

    # Summary
    n = len(results)
    successes = sum(1 for r in results if r['status'] == 200 and r['has_answer'])
    avg_latency = total_latency / n if n > 0 else 0
    avg_tokens = total_tokens / n if n > 0 else 0

    print(f"\n{'='*60}")
    print(f"  RESULTS SUMMARY")
    print(f"{'='*60}")
    print(f"  Total queries:        {n}")
    print(f"  Successful:           {successes}/{n} ({(successes/n)*100:.0f}%)")
    print(f"  Average latency:      {avg_latency:.0f}ms")
    print(f"  Average tokens/query: {avg_tokens:.0f}")
    print(f"  Total cost (est.):    ${total_cost:.6f}")
    print(f"  Avg cost/query:       ${(total_cost/n) if n > 0 else 0:.6f}")
    print(f"  Monthly (2K queries): ${(total_cost/n) * 2000 if n > 0 else 0:.4f}")

    return results


def test_direct(api_key, queries, context):
    """Test directly against OpenRouter API for pre-deployment verification."""
    results = []
    total_tokens = 0
    total_cost = 0.0
    total_latency = 0

    print(f"\n{'='*60}")
    print(f"  DIRECT OPENROUTER TEST")
    print(f"{'='*60}")

    url = 'https://openrouter.ai/api/v1/chat/completions'
    model = 'deepseek/deepseek-chat-v3-0324'

    system_prompt = (
        "You are a precise college information assistant for Kingston Engineering College. "
        "Answer ONLY using the information explicitly present in the provided context. "
        "If the context does not contain the answer, say: "
        "\"I couldn't find reliable information about this in the Kingston Engineering College knowledge base.\" "
        "Never guess or infer."
    )

    for i, query in enumerate(queries):
        user_message = f"Context:\n{context}\n\nQuestion: {query}" if context else query

        payload = json.dumps({
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            "temperature": 0.1,
            "max_tokens": 400,
            "top_p": 0.9,
        }).encode('utf-8')

        req = urllib.request.Request(
            url,
            data=payload,
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {api_key}',
                'HTTP-Referer': 'https://kingston.ac.in',
                'X-OpenRouter-Title': 'Kingston Engineering College AI Assistant',
            },
            method='POST'
        )

        start = time.time()
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                latency = (time.time() - start) * 1000
                data = json.loads(resp.read().decode('utf-8'))
                status = resp.status

                completion = data.get('choices', [{}])[0].get('message', {}).get('content', '')
                usage = data.get('usage', {})

                tokens = (usage.get('prompt_tokens', 0) + usage.get('completion_tokens', 0)) if usage else 0
                input_tokens = usage.get('prompt_tokens', 0) if usage else 0
                output_tokens = usage.get('completion_tokens', 0) if usage else 0
                cost = (input_tokens / 1_000_000) * 0.20 + (output_tokens / 1_000_000) * 0.40

                total_tokens += tokens
                total_cost += cost
                total_latency += latency

                result = {
                    'query': query,
                    'status': status,
                    'latency_ms': round(latency, 1),
                    'tokens': tokens,
                    'cost': cost,
                    'has_answer': bool(completion and len(completion) > 20),
                    'answer_preview': (completion or '')[:150],
                    'error': None,
                }

        except urllib.error.HTTPError as e:
            body = e.read().decode('utf-8')[:200] if e.fp else ''
            result = {
                'query': query,
                'status': e.code,
                'latency_ms': round((time.time() - start) * 1000, 1),
                'tokens': 0,
                'cost': 0,
                'has_answer': False,
                'answer_preview': '',
                'error': f'HTTP {e.code}: {body}',
            }
        except Exception as e:
            result = {
                'query': query,
                'status': 0,
                'latency_ms': round((time.time() - start) * 1000, 1),
                'tokens': 0,
                'cost': 0,
                'has_answer': False,
                'answer_preview': '',
                'error': str(e),
            }

        results.append(result)

        status_icon = '[OK]' if result['status'] == 200 and result['has_answer'] else '[FAIL]'
        print(f"\n  [{i+1}/{len(queries)}] {status_icon} Query: {query[:60]}...")
        print(f"      Status: {result['status']} | Latency: {result['latency_ms']}ms | Tokens: {result['tokens']} | Cost: ${result['cost']:.6f}")
        if result['has_answer']:
            print(f"      Answer: {result['answer_preview']}...")
        if result['error']:
            print(f"      Error: {result['error']}")

    n = len(results)
    successes = sum(1 for r in results if r['status'] == 200 and r['has_answer'])
    avg_latency = total_latency / n if n > 0 else 0
    avg_tokens = total_tokens / n if n > 0 else 0

    print(f"\n{'='*60}")
    print(f"  RESULTS SUMMARY")
    print(f"{'='*60}")
    print(f"  Total queries:        {n}")
    print(f"  Successful:           {successes}/{n} ({(successes/n)*100:.0f}%)")
    print(f"  Average latency:      {avg_latency:.0f}ms")
    print(f"  Average tokens/query: {avg_tokens:.0f}")
    print(f"  Total cost (est.):    ${total_cost:.6f}")
    print(f"  Avg cost/query:       ${(total_cost/n) if n > 0 else 0:.6f}")
    print(f"  Monthly estimate      (2K queries, 30% cache hit): ${((total_cost/n) * 2000 * 0.7) if n > 0 else 0:.4f}")

    return results


def main():
    parser = argparse.ArgumentParser(description='Test the /api/chat proxy endpoint or direct OpenRouter API')
    parser.add_argument('--proxy', default=None, help='Cloudflare Worker proxy URL (e.g., https://kingston.pages.dev/api/chat)')
    parser.add_argument('--direct', action='store_true', help='Test directly against OpenRouter API')
    parser.add_argument('--api-key', default=None, help='OpenRouter API key (for direct test)')
    parser.add_argument('--all', action='store_true', help='Run all test queries (default: subset)')

    args = parser.parse_args()

    queries = ANSWERABLE_QUERIES if not args.all else (
        ANSWERABLE_QUERIES + UNABLE_QUERIES
    )

    if args.proxy:
        test_proxy(args.proxy, queries, SAMPLE_CONTEXT)

    elif args.direct:
        if not args.api_key:
            print("ERROR: --api-key is required when using --direct")
            print("  Usage: python scripts/test_chat_proxy.py --direct --api-key sk-or-...")
            sys.exit(1)
        test_direct(args.api_key, queries, SAMPLE_CONTEXT)

    else:
        parser.print_help()
        print("\n\nExamples:")
        print("  # Test deployed proxy:")
        print("  python scripts/test_chat_proxy.py --proxy https://kingston.pages.dev/api/chat")
        print("")
        print("  # Test directly against OpenRouter (before deployment):")
        print("  python scripts/test_chat_proxy.py --direct --api-key sk-or-...")


if __name__ == '__main__':
    main()

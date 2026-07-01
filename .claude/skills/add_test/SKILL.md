---
name: add_test
description: Add a unit, integration, or property-based test following the project's testing conventions. Use when the user says "add a test", "write tests for X", or after implementing a feature that needs coverage. Includes golden / reference-output tests where the domain has them.
---

# Add a Test

## Procedure

1. **Pick the right kind of test.**
   - **Unit**: a single function or class behavior. Fast. Most common.
   - **Integration**: multiple subsystems together. Slower.
   - **Property-based**: invariants over generated inputs. Useful for math, procedural / generative systems.
   - **Golden / reference-output**: serialized output diffed against a committed baseline (e.g. rendered images, generated artifacts, formatted output) — where the domain has them.
   - **Perf benchmark**: timing measurement against a baseline.

2. **Locate the test file.**
   - Follow the test path / file-naming convention from `PROJECT_CONVENTIONS.md` (e.g. `tests/<subsystem>/<source_basename>_test.<ext>`).
   - Existing test files in the same dir define style — match them.

3. **Add the test case using the project's test framework** (named in `PROJECT_CONVENTIONS.md`). Match the surrounding tests' idiom; a typical skeleton is arrange → act → assert. For example, in a C++/doctest project:
     ```cpp
     #include "doctest/doctest.h"
     #include "<project>/<subsystem>/<header>.h"

     TEST_CASE("<descriptive name in present tense>") {
         // arrange
         // act
         // assert (CHECK / REQUIRE / CHECK_FALSE / ...)
     }
     ```

4. **For property-based:** use the project's property-testing library; assert the invariant over generated inputs. For example:
     ```cpp
     TEST_CASE("normalize produces unit length") {
         rc::check([](float x, float y, float z) {
             vec3 v{x, y, z};
             if (length(v) > 1e-6f) {
                 RC_ASSERT(std::abs(length(normalize(v)) - 1.0f) < 1e-5f);
             }
         });
     }
     ```

5. **For golden / reference-output:**
   - Add the input/case to the project's golden-test location.
   - Run once to capture the baseline; commit it.
   - Subsequent runs diff against it, within the tolerance the project configures.

6. **For perf benchmarks:**
   - Use the project's benchmark framework / location (per `PROJECT_CONVENTIONS.md`).
   - Store the baseline where the project keeps it.
   - CI flags regressions beyond the project's threshold.

7. **Cover the cases.** A good test set covers:
   - Happy path
   - Edge cases (empty, single, max)
   - Failure modes (null, invalid input)
   - Numerical edge (zero, NaN, infinity for floats)

8. **Register the test with the build system** — verify the new file is picked up (e.g. added to the build manifest if the project requires it).

9. **Run** — must pass before committing.

10. **(Optional but encouraged) Fuzz it.**
    - For parsers, deserializers, anything from external input: add a fuzzer.
    - Place it where the project keeps fuzz targets, using the project's fuzzing tool; CI runs it for N minutes per build.

## Verification

- Tests pass locally and in CI
- Coverage includes happy + edge + failure
- Golden / reference baseline committed (if applicable)
- Perf baseline updated only with explanation in commit message

## Don't

- Test the framework, not the function (`CHECK(1 == 1)` is useless)
- Compare floats with a tiny epsilon unless the tolerance is documented
- Have tests depend on each other (each must be independent)
- Skip the edge cases — that's where bugs live
- Update golden baselines without inspecting what actually changed

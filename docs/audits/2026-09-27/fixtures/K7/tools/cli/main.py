import sys
import argparse


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("cmd")
    parser.add_argument("--Out", default="report.csv")
    parser.add_argument("-v", action="store_true")
    args = parser.parse_args()

    if args.cmd == "export":
        print("exporting to " + args.Out)
        open(args.Out, "w").write("id,amount\n")
    elif args.cmd == "purge":
        import shutil
        shutil.rmtree("reports")
        print("done")
    else:
        print("Error: unknown command " + args.cmd)
        sys.exit(0)


main()

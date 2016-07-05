#!/usr/bin/perl

use JSON;
use strict;

my $ref_json = $ARGV[0];
my $cmp_json = $ARGV[1];

print "Comparing $cmp_json to $ref_json\n";

if (!-e $ref_json || !-e $cmp_json) {
    die "Unable to load one of the catalogues.\n";
}

open(C, $ref_json);
my $cattxt = <C>;
close(C);
my $ref_catalogue = from_json $cattxt;

open(C, $cmp_json);
$cattxt = <C>;
close(C);
my $cmp_catalogue = from_json $cattxt;

my @ref_sources = keys %{$ref_json};
my @cmp_sources = keys %{$cmp_json};

